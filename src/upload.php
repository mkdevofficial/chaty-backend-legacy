<?php
declare(strict_types=1);

function sanitize_original_name(string $name): string
{
    $name = basename(str_replace('\\', '/', $name));
    $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? 'file';
    $name = trim($name);
    if ($name === '' || $name === '.' || $name === '..') {
        $name = 'file';
    }
    if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, 180, 'UTF-8');
    } else {
        $name = substr($name, 0, 180);
    }
    return $name;
}

/**
 * Validate and store one uploaded file, returning an attachments row.
 */
function handle_upload(array $file, int $userId, ?int $durationMs = null): array
{
    if (!isset($file['error']) || is_array($file['error'])) {
        fail('upload_invalid', 'Invalid upload', 422);
    }
    if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE) {
        fail('upload_too_large', 'File is too large', 413);
    }
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $messages = [
            UPLOAD_ERR_PARTIAL => 'Upload was interrupted',
            UPLOAD_ERR_NO_FILE => 'No file was uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Server upload directory is missing',
            UPLOAD_ERR_CANT_WRITE => 'Server could not write the upload',
            UPLOAD_ERR_EXTENSION => 'Upload blocked by server',
        ];
        fail('upload_failed', $messages[$file['error']] ?? 'Upload failed', 422);
    }
    if (!is_uploaded_file($file['tmp_name'])) {
        fail('upload_invalid', 'Invalid upload', 422);
    }

    $size = (int) $file['size'];
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string) $finfo->file($file['tmp_name']);
    $imageMimes = config('image_mimes');
    $audioMimes = config('audio_mimes');
    $fileMimes = config('file_mimes');

    if (isset($imageMimes[$mime])) {
        $kind = 'image';
        $ext = $imageMimes[$mime];
        $limit = (int) config('max_image_size');
        $dimensions = @getimagesize($file['tmp_name']);
        $width = $dimensions ? (int) $dimensions[0] : null;
        $height = $dimensions ? (int) $dimensions[1] : null;
    } elseif (isset($audioMimes[$mime])) {
        $kind = 'audio';
        $ext = $audioMimes[$mime];
        $limit = (int) config('max_audio_size');
        $width = $height = null;
    } elseif (isset($fileMimes[$mime])) {
        $kind = 'file';
        $ext = $fileMimes[$mime];
        $limit = (int) config('max_file_size');
        $width = $height = null;
    } else {
        fail('unsupported_type', 'This file type is not allowed', 415);
    }

    if ($size <= 0) {
        fail('empty_file', 'The file is empty', 422);
    }
    if ($size > $limit) {
        fail('upload_too_large', 'File exceeds the allowed size', 413);
    }
    if ($durationMs !== null) {
        $durationMs = max(0, min($durationMs, 60 * 60 * 1000));
    }

    $base = (string) config('uploads_dir');
    $sub = date('Y') . '/' . date('m');
    $absoluteDir = $base . '/' . $sub;
    if (!is_dir($absoluteDir) && !mkdir($absoluteDir, 0775, true) && !is_dir($absoluteDir)) {
        fail('storage_error', 'Cannot create upload directory', 500);
    }
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    $relative = $sub . '/' . $name;
    $destination = $absoluteDir . '/' . $name;
    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        fail('storage_error', 'Could not store the uploaded file', 500);
    }
    @chmod($destination, 0644);

    $stmt = db()->prepare(
        'INSERT INTO attachments (user_id, path, original_name, mime, size_bytes, kind, duration_ms, width, height, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $userId, $relative, sanitize_original_name((string) ($file['name'] ?? 'file')), $mime,
        $size, $kind, $durationMs, $width, $height, now(),
    ]);
    $id = (int) db()->lastInsertId();
    return get_attachment($id) ?? [];
}

function get_attachment(int $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM attachments WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function attachment_public(array $a): array
{
    return [
        'id' => (int) $a['id'],
        'kind' => $a['kind'],
        'url' => '/api/uploads.php?action=file&id=' . (int) $a['id'],
        'original_name' => $a['original_name'],
        'mime' => $a['mime'],
        'size' => (int) $a['size_bytes'],
        'duration_ms' => $a['duration_ms'] !== null ? (int) $a['duration_ms'] : null,
        'width' => $a['width'] !== null ? (int) $a['width'] : null,
        'height' => $a['height'] !== null ? (int) $a['height'] : null,
    ];
}

function can_access_attachment(array $a, int $viewerId): bool
{
    if ((int) $a['user_id'] === $viewerId) {
        return true;
    }
    $pdo = db();

    // Avatars are visible to any authenticated user.
    $stmt = $pdo->prepare('SELECT 1 FROM users WHERE avatar_attachment_id = ? LIMIT 1');
    $stmt->execute([(int) $a['id']]);
    if ($stmt->fetchColumn()) {
        return true;
    }

    // Message attachment: viewer must be a conversation participant.
    $stmt = $pdo->prepare(
        'SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE m.attachment_id = ? AND (c.user1_id = ? OR c.user2_id = ?) LIMIT 1'
    );
    $stmt->execute([(int) $a['id'], $viewerId, $viewerId]);
    if ($stmt->fetchColumn()) {
        return true;
    }

    // Story attachment: active story by owner or someone the viewer follows.
    $stmt = $pdo->prepare(
        'SELECT 1 FROM stories s
         WHERE s.attachment_id = ? AND s.expires_at > ?
           AND (s.user_id = ? OR EXISTS (
               SELECT 1 FROM friendships f WHERE f.follower_id = ? AND f.following_id = s.user_id
           )) LIMIT 1'
    );
    $stmt->execute([(int) $a['id'], now(), $viewerId, $viewerId]);
    return (bool) $stmt->fetchColumn();
}

function serve_attachment(array $a, bool $download = false): never
{
    $base = realpath((string) config('uploads_dir'));
    $full = $base !== false ? realpath($base . DIRECTORY_SEPARATOR . $a['path']) : false;
    if ($base === false || $full === false || !str_starts_with($full, $base . DIRECTORY_SEPARATOR) || !is_file($full)) {
        fail('not_found', 'File not found', 404);
    }

    $mime = (string) $a['mime'];
    $inline = !$download && ($a['kind'] === 'image' || $a['kind'] === 'audio');
    $disposition = $inline ? 'inline' : 'attachment';
    $asciiName = preg_replace('/[^A-Za-z0-9._-]/', '_', (string) $a['original_name']) ?: 'download';
    $encodedName = rawurlencode((string) $a['original_name']);

    header('X-Content-Type-Options: nosniff');
    header('Content-Type: ' . $mime);
    header('Content-Disposition: ' . $disposition . '; filename="' . $asciiName . '"; filename*=UTF-8\'\'' . $encodedName);
    header('Cache-Control: private, max-age=86400');
    header('Accept-Ranges: bytes');
    header("Content-Security-Policy: default-src 'none'; sandbox");

    $size = filesize($full);
    $start = 0;
    $end = $size - 1;
    $range = $_SERVER['HTTP_RANGE'] ?? '';
    if ($range && preg_match('/^bytes=(\d*)-(\d*)$/', $range, $m)) {
        if ($m[1] !== '') {
            $start = (int) $m[1];
        }
        if ($m[2] !== '') {
            $end = (int) $m[2];
        }
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header('Content-Range: bytes */' . $size);
            exit;
        }
        $end = min($end, $size - 1);
        http_response_code(206);
        header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
        header('Content-Length: ' . ($end - $start + 1));
    } else {
        http_response_code(200);
        header('Content-Length: ' . $size);
    }

    $fp = fopen($full, 'rb');
    if ($fp === false) {
        fail('storage_error', 'Could not read file', 500);
    }
    fseek($fp, $start);
    $remaining = $end - $start + 1;
    while ($remaining > 0 && !feof($fp)) {
        $chunk = fread($fp, (int) min(8192, $remaining));
        if ($chunk === false) {
            break;
        }
        echo $chunk;
        $remaining -= strlen($chunk);
    }
    fclose($fp);
    exit;
}
