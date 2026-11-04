<?php
declare(strict_types=1);

function normalize_phone(string $phone): string
{
    $phone = trim($phone);
    $phone = preg_replace('/[\s\-().]/', '', $phone) ?? '';
    if ($phone !== '' && $phone[0] !== '+') {
        $phone = '+' . ltrim($phone, '+');
    }
    return $phone;
}

function valid_phone(string $phone): bool
{
    return (bool) preg_match('/^\+[0-9]{7,15}$/', $phone);
}

function valid_username(string $username): bool
{
    return (bool) preg_match('/^[a-z0-9_]{3,20}$/', $username);
}

function clean_username(string $username): string
{
    return strtolower(trim(ltrim(trim($username), '@')));
}

function clean_text(string $value): string
{
    return trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '');
}

function validate_password(string $password): ?string
{
    $len = function_exists('mb_strlen') ? mb_strlen($password) : strlen($password);
    if ($len < 8) {
        return 'Password must be at least 8 characters';
    }
    if ($len > 128) {
        return 'Password is too long';
    }
    return null;
}

function validate_username_or_fail(string $username, ?int $exceptUserId = null): string
{
    $username = clean_username($username);
    if (!valid_username($username)) {
        fail('invalid_username', 'Username must be 3-20 lowercase letters, numbers or underscore', 422);
    }
    $stmt = db()->prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ? LIMIT 1');
    $stmt->execute([$username, $exceptUserId ?? 0]);
    if ($stmt->fetchColumn()) {
        fail('username_taken', 'This username is already taken', 409);
    }
    return $username;
}

function text_length(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }
    $count = preg_match_all('/./us', $value);
    return $count === false ? strlen($value) : $count;
}
