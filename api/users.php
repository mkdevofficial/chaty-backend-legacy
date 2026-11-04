<?php
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$action = input_string('action', '');
$viewer = require_auth();

switch ($action) {
    case 'profile':
        require_method('GET');
        $id = input_int('id');
        if (!$id) {
            fail('invalid_user', 'Missing user', 422);
        }
        $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $target = $stmt->fetch();
        if (!$target) {
            fail('not_found', 'User not found', 404);
        }
        $following = false;
        $followsMe = false;
        if ((int) $target['id'] !== (int) $viewer['id']) {
            $rel = db()->prepare('SELECT 1 FROM friendships WHERE follower_id = ? AND following_id = ?');
            $rel->execute([(int) $viewer['id'], (int) $target['id']]);
            $following = (bool) $rel->fetchColumn();
            $rel->execute([(int) $target['id'], (int) $viewer['id']]);
            $followsMe = (bool) $rel->fetchColumn();
        }
        $counts = db()->prepare(
            'SELECT
              (SELECT COUNT(*) FROM friendships WHERE follower_id = ?) AS following_count,
              (SELECT COUNT(*) FROM friendships WHERE following_id = ?) AS followers_count,
              (SELECT COUNT(*) FROM stories WHERE user_id = ? AND expires_at > ?) AS stories_count'
        );
        $counts->execute([(int) $target['id'], (int) $target['id'], (int) $target['id'], now()]);
        $stats = $counts->fetch();
        ok([
            'user' => public_user($target, (int) $target['id'] === (int) $viewer['id']),
            'relationship' => [
                'is_self' => (int) $target['id'] === (int) $viewer['id'],
                'is_following' => $following,
                'follows_me' => $followsMe,
                'is_friend' => $following || $followsMe,
            ],
            'stats' => [
                'following' => (int) $stats['following_count'],
                'followers' => (int) $stats['followers_count'],
                'stories' => (int) $stats['stories_count'],
            ],
        ]);
        break;

    case 'search':
        require_method('GET');
        $q = trim(input_string('q'));
        if ($q === '') {
            ok(['users' => []]);
        }
        $pdo = db();
        if (str_starts_with($q, '@')) {
            $needle = clean_username(substr($q, 1));
            if ($needle === '') {
                ok(['users' => []]);
            }
            $stmt = $pdo->prepare(
                'SELECT * FROM users WHERE username LIKE ? COLLATE NOCASE AND id <> ? ORDER BY username LIMIT 30'
            );
            $stmt->execute([$needle . '%', (int) $viewer['id']]);
        } elseif (preg_match('/^[+\d\s\-().]+$/', $q)) {
            $phone = normalize_phone($q);
            $stmt = $pdo->prepare('SELECT * FROM users WHERE phone = ? AND id <> ? LIMIT 30');
            $stmt->execute([$phone, (int) $viewer['id']]);
        } else {
            $needle = clean_username($q);
            $stmt = $pdo->prepare(
                'SELECT * FROM users WHERE username LIKE ? COLLATE NOCASE AND id <> ? ORDER BY username LIMIT 30'
            );
            $stmt->execute([$needle . '%', (int) $viewer['id']]);
        }
        $users = [];
        $rel = $pdo->prepare('SELECT 1 FROM friendships WHERE follower_id = ? AND following_id = ?');
        foreach ($stmt->fetchAll() as $u) {
            $rel->execute([(int) $viewer['id'], (int) $u['id']]);
            $isFollowing = (bool) $rel->fetchColumn();
            $rel->execute([(int) $u['id'], (int) $viewer['id']]);
            $followsMe = (bool) $rel->fetchColumn();
            $users[] = [
                'user' => public_user($u),
                'is_following' => $isFollowing,
                'follows_me' => $followsMe,
            ];
        }
        ok(['users' => $users]);
        break;

    case 'following':
    case 'followers':
        require_method('GET');
        $id = input_int('id', (int) $viewer['id']);
        $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            fail('not_found', 'User not found', 404);
        }
        if ($action === 'following') {
            $stmt = db()->prepare(
                'SELECT u.* FROM friendships f JOIN users u ON u.id = f.following_id
                 WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT 200'
            );
        } else {
            $stmt = db()->prepare(
                'SELECT u.* FROM friendships f JOIN users u ON u.id = f.follower_id
                 WHERE f.following_id = ? ORDER BY f.created_at DESC LIMIT 200'
            );
        }
        $stmt->execute([$id]);
        $users = array_map('public_user', $stmt->fetchAll());
        ok(['users' => $users, 'user_id' => (int) $id]);
        break;

    case 'avatar':
        require_method('GET');
        $id = input_int('id');
        if (!$id) {
            fail('invalid_user', 'Missing user', 422);
        }
        $stmt = db()->prepare('SELECT avatar_attachment_id FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row || !$row['avatar_attachment_id']) {
            fail('not_found', 'No avatar', 404);
        }
        $attachment = get_attachment((int) $row['avatar_attachment_id']);
        if (!$attachment) {
            fail('not_found', 'No avatar', 404);
        }
        serve_attachment($attachment, false);
        break;

    default:
        fail('unknown_action', 'Unknown action', 404);
}
