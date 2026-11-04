<?php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = is_string($path) ? rawurldecode($path) : '/';

// Protect internal folders even if someone starts the server from the parent.
if (preg_match('#^/(data|uploads|src)(/|$)#', $path)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    return true;
}

// JSON API: only explicitly allowed resource files.
if (str_starts_with($path, '/api/')) {
    if (!preg_match('#^/api/([a-z]+)\.php$#', $path, $m)) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => ['code' => 'not_found', 'message' => 'Endpoint not found']]);
        return true;
    }
    $allowed = ['auth', 'users', 'friends', 'conversations', 'messages', 'uploads', 'stories'];
    if (!in_array($m[1], $allowed, true)) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => ['code' => 'not_found', 'message' => 'Endpoint not found']]);
        return true;
    }
    require __DIR__ . '/api/' . $m[1] . '.php';
    return true;
}

// Static files are served by PHP's built-in server from the public/ document root.
return false;
