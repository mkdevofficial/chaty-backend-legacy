<?php
declare(strict_types=1);

function send_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: geolocation=(), camera=(), microphone=(self)');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
}

function json_response(mixed $data, int $status = 200): never
{
    if (!headers_sent()) {
        http_response_code($status);
        send_security_headers();
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ok(mixed $data = null, int $status = 200): never
{
    json_response(['ok' => true, 'data' => $data], $status);
}

function fail(string $code, string $message, int $status = 400): never
{
    json_response(['ok' => false, 'error' => ['code' => $code, 'message' => $message]], $status);
}

function require_method(string ...$methods): void
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, array_map('strtoupper', $methods), true)) {
        header('Allow: ' . implode(', ', $methods));
        fail('method_not_allowed', 'Method not allowed', 405);
    }
}

function request_body(): array
{
    static $body = null;
    if ($body !== null) {
        return $body;
    }
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $decoded = json_decode($raw ?: '[]', true);
        $body = is_array($decoded) ? $decoded : [];
    } else {
        $body = $_POST;
    }
    return $body;
}

function input(string $key, mixed $default = null): mixed
{
    $body = request_body();
    return $body[$key] ?? $_GET[$key] ?? $default;
}

function input_string(string $key, string $default = ''): string
{
    $value = input($key, $default);
    return is_string($value) ? $value : $default;
}

function input_int(string $key, ?int $default = null): ?int
{
    $value = input($key, null);
    if ($value === null || $value === '') {
        return $default;
    }
    if (is_int($value)) {
        return $value;
    }
    if (is_string($value) && preg_match('/^-?\d+$/', $value)) {
        return (int) $value;
    }
    return $default;
}
