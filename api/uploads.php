<?php
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$action = input_string('action', 'file');
$viewer = require_auth();

switch ($action) {
    case 'upload':
        require_method('POST');
        require_csrf();
        $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        $maxPost = 28 * 1024 * 1024;
        if ($length > $maxPost) {
            fail('upload_too_large', 'Upload exceeds the server limit', 413);
        }
        if (!isset($_FILES['file'])) {
            fail('no_file', 'No file was uploaded', 422);
        }
        $duration = input_int('duration_ms');
        $attachment = handle_upload($_FILES['file'], (int) $viewer['id'], $duration);
        ok(['attachment' => attachment_public($attachment)], 201);
        break;

    case 'file':
        require_method('GET');
        $id = input_int('id');
        if (!$id) {
            fail('invalid_attachment', 'Missing attachment', 422);
        }
        $attachment = get_attachment($id);
        if (!$attachment) {
            fail('not_found', 'Attachment not found', 404);
        }
        if (!can_access_attachment($attachment, (int) $viewer['id'])) {
            fail('forbidden', 'You cannot access this file', 403);
        }
        serve_attachment($attachment, (bool) input('download', false));
        break;

    default:
        fail('unknown_action', 'Unknown action', 404);
}
