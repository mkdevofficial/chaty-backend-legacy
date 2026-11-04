<?php
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/message.php';

$action = input_string('action', 'list');
$viewer = require_auth();
$pdo = db();
$uid = (int) $viewer['id'];

switch ($action) {
    case 'list':
        require_method('GET');
        $stmt = $pdo->prepare(
            'SELECT c.*,
                CASE WHEN c.user1_id = :uid THEN c.user2_id ELSE c.user1_id END AS peer_id
             FROM conversations c
             WHERE c.user1_id = :uid OR c.user2_id = :uid
             ORDER BY c.updated_at DESC
             LIMIT 100'
        );
        $stmt->execute([':uid' => $uid]);
        $rows = $stmt->fetchAll();
        $conversations = [];
        $peerStmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $lastStmt = $pdo->prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1');
        $unreadStmt = $pdo->prepare('SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL');
        $typingStmt = $pdo->prepare('SELECT 1 FROM typing WHERE conversation_id = ? AND user_id = ? AND updated_at > ?');

        foreach ($rows as $row) {
            $peerStmt->execute([(int) $row['peer_id']]);
            $peer = $peerStmt->fetch();
            if (!$peer) {
                continue;
            }
            $lastStmt->execute([(int) $row['id']]);
            $last = $lastStmt->fetch();
            $unreadStmt->execute([(int) $row['id'], $uid]);
            $typingStmt->execute([(int) $row['id'], (int) $row['peer_id'], now() - 5]);
            $conversations[] = [
                'id' => (int) $row['id'],
                'peer' => public_user($peer),
                'last_message' => $last ? message_public($last) : null,
                'unread' => (int) $unreadStmt->fetchColumn(),
                'typing' => (bool) $typingStmt->fetchColumn(),
                'updated_at' => (int) $row['updated_at'],
                'created_at' => (int) $row['created_at'],
            ];
        }
        ok(['conversations' => $conversations]);
        break;

    case 'open':
        require_method('POST');
        require_csrf();
        $peerId = input_int('user_id');
        if (!$peerId || $peerId === $uid) {
            fail('invalid_user', 'Invalid user', 422);
        }
        $peerStmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $peerStmt->execute([$peerId]);
        $peer = $peerStmt->fetch();
        if (!$peer) {
            fail('not_found', 'User not found', 404);
        }
        $a = min($uid, $peerId);
        $b = max($uid, $peerId);
        $find = $pdo->prepare('SELECT * FROM conversations WHERE user1_id = ? AND user2_id = ?');
        $find->execute([$a, $b]);
        $conversation = $find->fetch();
        $isNew = false;
        if (!$conversation) {
            try {
                $pdo->prepare('INSERT INTO conversations (user1_id, user2_id, created_at, updated_at) VALUES (?, ?, ?, ?)')
                    ->execute([$a, $b, now(), now()]);
                $conversation = [
                    'id' => (int) $pdo->lastInsertId(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
                $isNew = true;
            } catch (PDOException $e) {
                $find->execute([$a, $b]);
                $conversation = $find->fetch();
                if (!$conversation) {
                    throw $e;
                }
            }
        }
        ok([
            'conversation' => [
                'id' => (int) $conversation['id'],
                'peer' => public_user($peer),
                'created_at' => (int) $conversation['created_at'],
                'updated_at' => (int) $conversation['updated_at'],
                'unread' => 0,
            ],
            'is_new' => $isNew,
        ]);
        break;

    case 'get':
        require_method('GET');
        $id = input_int('id');
        if (!$id) {
            fail('invalid_conversation', 'Missing conversation', 422);
        }
        $stmt = $pdo->prepare('SELECT * FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)');
        $stmt->execute([$id, $uid, $uid]);
        $conversation = $stmt->fetch();
        if (!$conversation) {
            fail('not_found', 'Conversation not found', 404);
        }
        $peerId = (int) $conversation['user1_id'] === $uid ? (int) $conversation['user2_id'] : (int) $conversation['user1_id'];
        $peerStmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $peerStmt->execute([$peerId]);
        $peer = $peerStmt->fetch();
        $unreadStmt = $pdo->prepare('SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL');
        $unreadStmt->execute([$id, $uid]);
        ok([
            'conversation' => [
                'id' => (int) $conversation['id'],
                'peer' => public_user($peer),
                'created_at' => (int) $conversation['created_at'],
                'updated_at' => (int) $conversation['updated_at'],
                'unread' => (int) $unreadStmt->fetchColumn(),
            ],
        ]);
        break;

    default:
        fail('unknown_action', 'Unknown action', 404);
}
