<?php
declare(strict_types=1);

function is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    return strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function set_session_cookie(string $token): void
{
    $expires = now() + (int) config('session_lifetime');
    setcookie((string) config('session_cookie'), $token, [
        'expires' => $expires,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    $_COOKIE[config('session_cookie')] = $token;
}

function clear_session_cookie(): void
{
    setcookie((string) config('session_cookie'), '', [
        'expires' => now() - 3600,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    unset($_COOKIE[config('session_cookie')]);
}

function create_session(?int $userId = null): array
{
    $pdo = db();
    $token = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(24));
    $expires = now() + (int) config('session_lifetime');
    $stmt = $pdo->prepare('INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([hash('sha256', $token), $userId, $csrf, now(), now(), $expires]);
    set_session_cookie($token);
    return [
        'token' => $token,
        'csrf_token' => $csrf,
        'user_id' => $userId,
        'expires_at' => $expires,
    ];
}

function load_session(): ?array
{
    $cookieName = (string) config('session_cookie');
    $token = $_COOKIE[$cookieName] ?? '';
    if (!is_string($token) || $token === '') {
        return null;
    }
    $stmt = db()->prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1');
    $stmt->execute([hash('sha256', $token), now()]);
    $session = $stmt->fetch();
    if (!$session) {
        return null;
    }
    return $session;
}

function ensure_session(): array
{
    static $session = null;
    if ($session !== null) {
        return $session;
    }
    $existing = load_session();
    if ($existing) {
        $session = $existing;
        $session['csrf_token'] = $existing['csrf_token'];
        return $session;
    }
    $session = create_session(null);
    return $session;
}

function auth_user(): ?array
{
    static $user = false;
    if ($user !== false) {
        return $user;
    }
    $session = ensure_session();
    if (empty($session['user_id'])) {
        $user = null;
        return null;
    }
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([(int) $session['user_id']]);
    $found = $stmt->fetch();
    if (!$found) {
        $user = null;
        return null;
    }

    // Keep presence fresh (write at most every 20 seconds).
    if ((int) $found['last_seen'] < now() - 20) {
        $touch = db()->prepare('UPDATE users SET last_seen = ? WHERE id = ?');
        $touch->execute([now(), (int) $found['id']]);
        $found['last_seen'] = now();
    }
    $touchSession = db()->prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?');
    $touchSession->execute([now(), hash('sha256', (string) $session['token'])]);
    $user = $found;
    return $user;
}

function require_auth(): array
{
    $user = auth_user();
    if (!$user) {
        fail('unauthorized', 'Authentication required', 401);
    }
    return $user;
}

function require_csrf(): void
{
    $session = ensure_session();
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($token) || $token === '' || !hash_equals((string) $session['csrf_token'], $token)) {
        fail('csrf_failed', 'Invalid or missing CSRF token', 419);
    }
}

function login_user(int $userId): array
{
    $session = ensure_session();
    $pdo = db();
    $pdo->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', (string) $session['token'])]);
    clear_session_cookie();
    $new = create_session($userId);
    $pdo->prepare('UPDATE users SET last_seen = ? WHERE id = ?')->execute([now(), $userId]);
    return $new;
}

function logout_user(): void
{
    $session = ensure_session();
    db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', (string) $session['token'])]);
    clear_session_cookie();
}

function login_rate_limited(string $phone, string $ip): bool
{
    $stmt = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE phone = ? AND ip = ? AND attempted_at > ?');
    $stmt->execute([$phone, $ip, now() - (int) config('login_window')]);
    return (int) $stmt->fetchColumn() >= (int) config('login_max_attempts');
}

function record_login_attempt(string $phone, string $ip): void
{
    db()->prepare('INSERT INTO login_attempts (phone, ip, attempted_at) VALUES (?, ?, ?)')
        ->execute([$phone, $ip, now()]);
}

function clear_login_attempts(string $phone, string $ip): void
{
    db()->prepare('DELETE FROM login_attempts WHERE phone = ? AND ip = ?')->execute([$phone, $ip]);
}

function public_user(array $user, bool $self = false): array
{
    $avatar = null;
    if (!empty($user['avatar_attachment_id'])) {
        $avatar = '/api/users.php?action=avatar&id=' . (int) $user['id'] . '&v=' . (int) $user['avatar_attachment_id'];
    }
    $data = [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'display_name' => $user['display_name'],
        'bio' => $user['bio'],
        'avatar_url' => $avatar,
        'last_seen' => (int) $user['last_seen'],
        'online' => (int) $user['last_seen'] >= now() - 60,
        'created_at' => (int) $user['created_at'],
    ];
    if ($self) {
        $data['phone'] = $user['phone'];
        $data['lang'] = $user['lang'];
        $data['theme'] = $user['theme'];
        $data['accent'] = $user['accent'];
        $data['wallpaper'] = $user['wallpaper'];
    }
    return $data;
}

function current_csrf(): string
{
    $session = ensure_session();
    return (string) $session['csrf_token'];
}
