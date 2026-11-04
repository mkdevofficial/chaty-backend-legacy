<?php
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$action = input_string('action', 'bootstrap');

switch ($action) {
    case 'bootstrap':
    case 'me':
        require_method('GET');
        $user = auth_user();
        ok([
            'user' => $user ? public_user($user, true) : null,
            'csrf_token' => current_csrf(),
            'limits' => [
                'image' => (int) config('max_image_size'),
                'audio' => (int) config('max_audio_size'),
                'file' => (int) config('max_file_size'),
            ],
        ]);
        break;

    case 'register':
        require_method('POST');
        require_csrf();
        $phone = normalize_phone(input_string('phone'));
        $username = clean_username(input_string('username'));
        $displayName = clean_text(input_string('display_name'));
        $password = input_string('password');

        if (!valid_phone($phone)) {
            fail('invalid_phone', 'Enter a valid phone number (7-15 digits, optional +)', 422);
        }
        if (!valid_username($username)) {
            fail('invalid_username', 'Username must be 3-20 lowercase letters, numbers or underscore', 422);
        }
        if ($displayName === '') {
            $displayName = $username;
        }
        if (text_length($displayName) < 1 || text_length($displayName) > 50) {
            fail('invalid_display_name', 'Display name must be 1-50 characters', 422);
        }
        $passwordError = validate_password($password);
        if ($passwordError) {
            fail('invalid_password', $passwordError, 422);
        }

        $pdo = db();
        $stmt = $pdo->prepare('SELECT id FROM users WHERE phone = ? LIMIT 1');
        $stmt->execute([$phone]);
        if ($stmt->fetchColumn()) {
            fail('phone_taken', 'This phone number is already registered', 409);
        }
        $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1');
        $stmt->execute([$username]);
        if ($stmt->fetchColumn()) {
            fail('username_taken', 'This username is already taken', 409);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO users (phone, username, display_name, password_hash, created_at, last_seen)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$phone, $username, $displayName, password_hash($password, PASSWORD_DEFAULT), now(), now()]);
        $userId = (int) $pdo->lastInsertId();
        $session = login_user($userId);
        $user = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $user->execute([$userId]);
        ok(['user' => public_user($user->fetch(), true), 'csrf_token' => $session['csrf_token']], 201);
        break;

    case 'login':
        require_method('POST');
        require_csrf();
        $phone = normalize_phone(input_string('phone'));
        $password = input_string('password');
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');

        if (!valid_phone($phone) || $password === '') {
            fail('invalid_credentials', 'Invalid phone number or password', 401);
        }
        if (login_rate_limited($phone, $ip)) {
            fail('rate_limited', 'Too many attempts. Please try again later.', 429);
        }
        $stmt = db()->prepare('SELECT * FROM users WHERE phone = ? LIMIT 1');
        $stmt->execute([$phone]);
        $user = $stmt->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) {
            record_login_attempt($phone, $ip);
            usleep(250000);
            fail('invalid_credentials', 'Invalid phone number or password', 401);
        }
        clear_login_attempts($phone, $ip);
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                ->execute([password_hash($password, PASSWORD_DEFAULT), (int) $user['id']]);
        }
        $session = login_user((int) $user['id']);
        $user['last_seen'] = now();
        ok(['user' => public_user($user, true), 'csrf_token' => $session['csrf_token']]);
        break;

    case 'logout':
        require_method('POST');
        require_auth();
        require_csrf();
        logout_user();
        ok(['logged_out' => true]);
        break;

    case 'update_profile':
        require_method('POST');
        $user = require_auth();
        require_csrf();
        $pdo = db();

        $username = array_key_exists('username', request_body())
            ? validate_username_or_fail(input_string('username'), (int) $user['id'])
            : $user['username'];
        $displayName = array_key_exists('display_name', request_body())
            ? clean_text(input_string('display_name'))
            : $user['display_name'];
        $bio = array_key_exists('bio', request_body())
            ? clean_text(input_string('bio'))
            : $user['bio'];

        if ($displayName === '' || text_length($displayName) > 50) {
            fail('invalid_display_name', 'Display name must be 1-50 characters', 422);
        }
        if (text_length($bio) > (int) config('max_bio')) {
            fail('bio_too_long', 'Bio is too long', 422);
        }

        $pdo->prepare('UPDATE users SET username = ?, display_name = ?, bio = ? WHERE id = ?')
            ->execute([$username, $displayName, $bio, (int) $user['id']]);
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([(int) $user['id']]);
        ok(['user' => public_user($stmt->fetch(), true)]);
        break;

    case 'avatar':
        require_method('POST');
        $user = require_auth();
        require_csrf();
        $attachmentId = input_int('attachment_id');
        if (!$attachmentId) {
            fail('invalid_attachment', 'Missing attachment', 422);
        }
        $attachment = get_attachment($attachmentId);
        if (!$attachment || (int) $attachment['user_id'] !== (int) $user['id'] || $attachment['kind'] !== 'image') {
            fail('invalid_attachment', 'Invalid image attachment', 422);
        }
        $old = $user['avatar_attachment_id'] ? (int) $user['avatar_attachment_id'] : null;
        $pdo = db();
        $pdo->prepare('UPDATE users SET avatar_attachment_id = ? WHERE id = ?')
            ->execute([$attachmentId, (int) $user['id']]);
        $pdo->prepare('UPDATE attachments SET used_at = ? WHERE id = ?')->execute([now(), $attachmentId]);
        if ($old && $old !== $attachmentId) {
            $oldRow = get_attachment($old);
            if ($oldRow && attachment_is_unreferenced($old, (int) $user['id'])) {
                delete_stored_file($oldRow['path']);
                $pdo->prepare('DELETE FROM attachments WHERE id = ?')->execute([$old]);
            }
        }
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([(int) $user['id']]);
        ok(['user' => public_user($stmt->fetch(), true)]);
        break;

    case 'remove_avatar':
        require_method('POST');
        $user = require_auth();
        require_csrf();
        $old = $user['avatar_attachment_id'] ? (int) $user['avatar_attachment_id'] : null;
        db()->prepare('UPDATE users SET avatar_attachment_id = NULL WHERE id = ?')->execute([(int) $user['id']]);
        if ($old) {
            $oldRow = get_attachment($old);
            if ($oldRow && attachment_is_unreferenced($old)) {
                delete_stored_file($oldRow['path']);
                db()->prepare('DELETE FROM attachments WHERE id = ?')->execute([$old]);
            }
        }
        $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([(int) $user['id']]);
        ok(['user' => public_user($stmt->fetch(), true)]);
        break;

    case 'settings':
        require_method('POST');
        $user = require_auth();
        require_csrf();
        $lang = input_string('lang', $user['lang']);
        $theme = input_string('theme', $user['theme']);
        $accent = input_string('accent', $user['accent']);
        $wallpaper = input_string('wallpaper', $user['wallpaper']);

        if (!in_array($lang, ['ar', 'en'], true)) {
            $lang = 'ar';
        }
        if (!in_array($theme, ['light', 'dark'], true)) {
            $theme = 'dark';
        }
        if (!in_array($accent, ['teal', 'violet', 'rose', 'amber'], true)) {
            $accent = 'teal';
        }
        if (!in_array($wallpaper, ['default', 'dots', 'waves', 'paper'], true)) {
            $wallpaper = 'default';
        }
        db()->prepare('UPDATE users SET lang = ?, theme = ?, accent = ?, wallpaper = ? WHERE id = ?')
            ->execute([$lang, $theme, $accent, $wallpaper, (int) $user['id']]);
        $user['lang'] = $lang;
        $user['theme'] = $theme;
        $user['accent'] = $accent;
        $user['wallpaper'] = $wallpaper;
        ok(['user' => public_user($user, true), 'csrf_token' => current_csrf()]);
        break;

    default:
        fail('unknown_action', 'Unknown action', 404);
}
