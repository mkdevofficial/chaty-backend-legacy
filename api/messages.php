<?php
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/message.php';

$action = input_string('action', 'list');
$viewer = require_auth();
$pdo = db();
$uid = (int) $viewer['id'];

function conversation_for_user(PDO $pdo, int $id, int $uid): array
{
    $stmt = $pdo->prepare('SELECT * FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)');
    $stmt->execute([$id, $uid, $uid]);
    $conversation = $stmt->fetch();
    if (!$conversation) {
        fail('not_found', 'Conversation not found', 404);
    }
    return $conversation;
}

function peer_for_conversation(PDO $pdo, array $conversation, int $uid): array
{
    $peerId = (int) $conversation['user1_id'] === $uid
        ? (int) $conversation['user2_id']
        : (int) $conversation['user1_id'];
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$peerId]);
    $peer = $stmt->fetch();
    if (!$peer) {
        fail('not_found', 'Peer not found', 404);
    }
    return $peer;
}

switch ($action) {
    case 'list':
        require_method('GET');
        $conversationId = input_int('conversation_id');
        if (!$conversationId) {
            fail('invalid_conversation', 'Missing conversation', 422);
        }
        $conversation = conversation_for_user($pdo, $conversationId, $uid);
        $peer = peer_for_conversation($pdo, $conversation, $uid);
        $limit = min(100, max(1, input_int('limit', 30) ?? 30));
        $afterId = max(0, input_int('after_id', 0) ?? 0);
        $beforeId = max(0, input_int('before_id', 0) ?? 0);

        // Receipts: receiving a message means it has been delivered to this device.
        $pdo->prepare(
            "UPDATE messages SET status = 'delivered'
             WHERE conversation_id = ? AND sender_id <> ? AND status = 'sent'"
        )->execute([$conversationId, $uid]);

        if ($afterId > 0) {
            $stmt = $pdo->prepare(
                'SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC LIMIT ' . $limit
            );
            $stmt->execute([$conversationId, $afterId]);
            $messages = $stmt->fetchAll();
            $hasMoreOlder = false;
        } elseif ($beforeId > 0) {
            $stmt = $pdo->prepare(
                'SELECT * FROM messages WHERE conversation_id = ? AND id < ? ORDER BY id DESC LIMIT ' . ($limit + 1)
            );
            $stmt->execute([$conversationId, $beforeId]);
            $rows = $stmt->fetchAll();
            $hasMoreOlder = count($rows) > $limit;
            $rows = array_slice($rows, 0, $limit);
            $messages = array_reverse($rows);
        } else {
            $stmt = $pdo->prepare(
                'SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ' . ($limit + 1)
            );
            $stmt->execute([$conversationId]);
            $rows = $stmt->fetchAll();
            $hasMoreOlder = count($rows) > $limit;
            $rows = array_slice($rows, 0, $limit);
            $messages = array_reverse($rows);
        }

        $readMarker = $pdo->prepare('SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ? AND sender_id = ? AND read_at IS NOT NULL');
        $readMarker->execute([$conversationId, $uid]);
        $deliveredMarker = $pdo->prepare("SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ? AND sender_id = ? AND status IN ('delivered','read')");
        $deliveredMarker->execute([$conversationId, $uid]);
        $typing = $pdo->prepare('SELECT 1 FROM typing WHERE conversation_id = ? AND user_id = ? AND updated_at > ?');
        $typing->execute([$conversationId, (int) $peer['id'], now() - 5]);

        ok([
            'conversation' => [
                'id' => (int) $conversation['id'],
                'peer' => public_user($peer),
                'created_at' => (int) $conversation['created_at'],
                'updated_at' => (int) $conversation['updated_at'],
            ],
            'messages' => array_map('message_public', $messages),
            'has_more_older' => $hasMoreOlder,
            'my_read_marker' => (int) $readMarker->fetchColumn(),
            'my_delivered_marker' => (int) $deliveredMarker->fetchColumn(),
            'peer_typing' => (bool) $typing->fetchColumn(),
        ]);
        break;

    case 'send':
        require_method('POST');
        require_csrf();
        $conversationId = input_int('conversation_id');
        if (!$conversationId) {
            fail('invalid_conversation', 'Missing conversation', 422);
        }
        $conversation = conversation_for_user($pdo, $conversationId, $uid);
        $type = input_string('type', 'text');
        $body = clean_text(input_string('body'));
        $attachmentId = input_int('attachment_id');
        $sticker = null;
        $attachment = null;

        if (!in_array($type, ['text', 'image', 'voice', 'file', 'sticker'], true)) {
            fail('invalid_type', 'Invalid message type', 422);
        }

        if ($type === 'text') {
            if ($body === '') {
                fail('empty_message', 'Message cannot be empty', 422);
            }
            if (text_length($body) > (int) config('max_text_message')) {
                fail('message_too_long', 'Message is too long', 422);
            }
            $attachmentId = null;
        } elseif ($type === 'sticker') {
            $sticker = input_string('sticker');
            if (!valid_sticker_key($sticker)) {
                fail('invalid_sticker', 'Invalid sticker', 422);
            }
            $body = '';
            $attachmentId = null;
        } else {
            if (!$attachmentId) {
                fail('invalid_attachment', 'Missing attachment', 422);
            }
            $attachment = get_attachment($attachmentId);
            if (!$attachment || (int) $attachment['user_id'] !== $uid) {
                fail('invalid_attachment', 'Invalid attachment', 422);
            }
            $expectedKind = $type === 'voice' ? 'audio' : $type;
            if ($attachment['kind'] !== $expectedKind) {
                fail('invalid_attachment', 'Attachment type does not match', 422);
            }
            if ($attachment['used_at'] !== null) {
                fail('attachment_used', 'This attachment has already been used', 409);
            }
            if ($type === 'image' && text_length($body) > 500) {
                fail('message_too_long', 'Caption is too long', 422);
            }
            if ($type !== 'image') {
                $body = '';
            }
        }

        $now = now();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO messages (conversation_id, sender_id, type, body, attachment_id, sticker, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([$conversationId, $uid, $type, $body, $attachmentId ?: null, $sticker, 'sent', $now]);
            $messageId = (int) $pdo->lastInsertId();
            if ($attachmentId) {
                $pdo->prepare('UPDATE attachments SET used_at = ? WHERE id = ?')->execute([$now, $attachmentId]);
            }
            $pdo->prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')->execute([$now, $conversationId]);
            $pdo->prepare('DELETE FROM typing WHERE conversation_id = ? AND user_id = ?')->execute([$conversationId, $uid]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $stmt = $pdo->prepare('SELECT * FROM messages WHERE id = ?');
        $stmt->execute([$messageId]);
        ok(['message' => message_public($stmt->fetch())], 201);
        break;

    case 'read':
        require_method('POST');
        require_csrf();
        $conversationId = input_int('conversation_id');
        if (!$conversationId) {
            fail('invalid_conversation', 'Missing conversation', 422);
        }
        conversation_for_user($pdo, $conversationId, $uid);
        $now = now();
        $stmt = $pdo->prepare(
            "UPDATE messages SET status = 'read', read_at = ?
             WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL"
        );
        $stmt->execute([$now, $conversationId, $uid]);
        $marker = $pdo->prepare('SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NOT NULL');
        $marker->execute([$conversationId, $uid]);
        ok(['read_count' => $stmt->rowCount(), 'peer_read_marker' => (int) $marker->fetchColumn()]);
        break;

    case 'typing':
        require_method('POST');
        require_csrf();
        $conversationId = input_int('conversation_id');
        if (!$conversationId) {
            fail('invalid_conversation', 'Missing conversation', 422);
        }
        conversation_for_user($pdo, $conversationId, $uid);
        $typing = (bool) input('typing', false);
        if ($typing) {
            $pdo->prepare(
                'INSERT INTO typing (conversation_id, user_id, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT(conversation_id, user_id) DO UPDATE SET updated_at = excluded.updated_at'
            )->execute([$conversationId, $uid, now()]);
        } else {
            $pdo->prepare('DELETE FROM typing WHERE conversation_id = ? AND user_id = ?')
                ->execute([$conversationId, $uid]);
        }
        ok(['typing' => $typing]);
        break;

    default:
        fail('unknown_action', 'Unknown action', 404);
}
