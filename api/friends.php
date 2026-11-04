<?php
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$action = input_string('action', '');
$viewer = require_auth();
$pdo = db();

switch ($action) {
    case 'follow':
        require_method('POST');
        require_csrf();
        $id = input_int('user_id');
        if (!$id || $id === (int) $viewer['id']) {
            fail('invalid_user', 'Invalid user', 422);
        }
        $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetchColumn()) {
            fail('not_found', 'User not found', 404);
        }
        $pdo->prepare('INSERT OR IGNORE INTO friendships (follower_id, following_id, created_at) VALUES (?, ?, ?)')
            ->execute([(int) $viewer['id'], $id, now()]);
        $stmt = $pdo->prepare('SELECT 1 FROM friendships WHERE follower_id = ? AND following_id = ?');
        $stmt->execute([$id, (int) $viewer['id']]);
        ok(['is_following' => true, 'follows_me' => (bool) $stmt->fetchColumn()]);
        break;

    case 'unfollow':
        require_method('POST');
        require_csrf();
        $id = input_int('user_id');
        if (!$id) {
            fail('invalid_user', 'Invalid user', 422);
        }
        $pdo->prepare('DELETE FROM friendships WHERE follower_id = ? AND following_id = ?')
            ->execute([(int) $viewer['id'], $id]);
        $stmt = $pdo->prepare('SELECT 1 FROM friendships WHERE follower_id = ? AND following_id = ?');
        $stmt->execute([$id, (int) $viewer['id']]);
        ok(['is_following' => false, 'follows_me' => (bool) $stmt->fetchColumn()]);
        break;

    case 'lists':
        require_method('GET');
        $id = input_int('id', (int) $viewer['id']);
        $following = $pdo->prepare(
            'SELECT u.*, f.created_at AS followed_at FROM friendships f JOIN users u ON u.id = f.following_id
             WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT 200'
        );
        $following->execute([$id]);
        $followers = $pdo->prepare(
            'SELECT u.*, f.created_at AS followed_at FROM friendships f JOIN users u ON u.id = f.follower_id
             WHERE f.following_id = ? ORDER BY f.created_at DESC LIMIT 200'
        );
        $followers->execute([$id]);
        ok([
            'following' => array_map('public_user', $following->fetchAll()),
            'followers' => array_map('public_user', $followers->fetchAll()),
        ]);
        break;

    default:
        fail('unknown_action', 'Unknown action', 404);
}
