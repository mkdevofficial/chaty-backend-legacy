<?php
declare(strict_types=1);

function message_public(array $m): array
{
    $attachment = null;
    if (!empty($m['attachment_id'])) {
        $a = get_attachment((int) $m['attachment_id']);
        if ($a) {
            $attachment = attachment_public($a);
        }
    }
    return [
        'id' => (int) $m['id'],
        'conversation_id' => (int) $m['conversation_id'],
        'sender_id' => (int) $m['sender_id'],
        'type' => $m['type'],
        'body' => $m['body'],
        'sticker' => $m['sticker'],
        'status' => $m['status'],
        'created_at' => (int) $m['created_at'],
        'read_at' => $m['read_at'] !== null ? (int) $m['read_at'] : null,
        'attachment' => $attachment,
    ];
}

function valid_sticker_key(string $key): bool
{
    if (!preg_match('#^[a-z]+/[a-z0-9_-]+\.svg$#', $key)) {
        return false;
    }
    $full = realpath(dirname(__DIR__) . '/public/assets/stickers/' . $key);
    $base = realpath(dirname(__DIR__) . '/public/assets/stickers');
    return $base !== false && $full !== false && str_starts_with($full, $base . DIRECTORY_SEPARATOR) && is_file($full);
}
