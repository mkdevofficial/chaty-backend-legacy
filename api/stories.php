<?php
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$action = input_string('action', 'list');
$viewer = require_auth();
$pdo = db();
$uid = (int) $viewer['id'];

$allowedBackgrounds = ['#0f766e', '#7c3aed', '#be123c', '#b45309', '#1d4ed8', '#15803d', '#0f172a', '#475569', '#db2777', '#0e7490'];

function story_public(array $s, bool $seen): array
{
    $attachment = null;
    if (!empty($s['attachment_id'])) {
        $a = get_attachment((int) $s['attachment_id']);
        if ($a) {
            $attachment = attachment_public($a);
        }
    }
    return [
        'id' => (int) $s['id'],
        'user_id' => (int) $s['user_id'],
        'kind' => $s['kind'],
        'caption' => $s['caption'],
        'background' => $s['background'],
        'created_at' => (int) $s['created_at'],
        'expires_at' => (int) $s['expires_at'],
        'seen' => $seen,
        'attachment' => $attachment,
    ];
}

function can_view_story(PDO $pdo, int $storyId, int $uid): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM stories WHERE id = ? AND expires_at > ?');
    $stmt->execute([$storyId, now()]);
    $story = $stmt->fetch();
    if (!$story) {
        return null;
    }
    if ((int) $story['user_id'] === $uid) {
        return $story;
    }
    $rel = $pdo->prepare('SELECT 1 FROM friendships WHERE follower_id = ? AND following_id = ?');
    $rel->execute([$uid, (int) $story['user_id']]);
    return $rel->fetchColumn() ? $story : null;
}

switch ($action) {
    case 'list':
        require_method('GET');
        gc();
        $stmt = $pdo->prepare(
            'SELECT s.*,
                EXISTS (SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.viewer_id = :uid) AS seen
             FROM stories s
             WHERE s.expires_at > :now
               AND (s.user_id = :uid OR s.user_id IN (
                    SELECT following_id FROM friendships WHERE follower_id = :uid
               ))
             ORDER BY s.created_at ASC'
        );
        $stmt->execute([':uid' => $uid, ':now' => now()]);
        $groups = [];
        $owners = [];
        $ownerStmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        foreach ($stmt->fetchAll() as $row) {
            $ownerId = (int) $row['user_id'];
            if (!isset($owners[$ownerId])) {
                $ownerStmt->execute([$ownerId]);
                $owners[$ownerId] = $ownerStmt->fetch();
            }
            if (!isset($groups[$ownerId])) {
                $groups[$ownerId] = [
                    'user' => public_user($owners[$ownerId]),
                    'stories' => [],
                    'has_unseen' => false,
                    'latest_at' => 0,
                    'is_self' => $ownerId === $uid,
                ];
            }
            $seen = $ownerId === $uid ? true : (bool) $row['seen'];
            $story = story_public($row, $seen);
            $groups[$ownerId]['stories'][] = $story;
            if (!$seen) {
                $groups[$ownerId]['has_unseen'] = true;
            }
            $groups[$ownerId]['latest_at'] = max($groups[$ownerId]['latest_at'], (int) $row['created_at']);
        }
        $list = array_values($groups);
        usort($list, function (array $a, array $b): int {
            if ($a['is_self'] !== $b['is_self']) {
                return $a['is_self'] ? -1 : 1;
            }
            if ($a['has_unseen'] !== $b['has_unseen']) {
                return $a['has_unseen'] ? -1 : 1;
            }
            return $b['latest_at'] <=> $a['latest_at'];
        });
        ok(['groups' => $list]);
        break;

    case 'create':
        require_method('POST');
        require_csrf();
        $kind = input_string('kind', 'text');
        if (!in_array($kind, ['text', 'image'], true)) {
            fail('invalid_kind', 'Invalid story type', 422);
        }
        $caption = clean_text(input_string('caption'));
        $background = input_string('background', '#0f766e');
        if (!in_array($background, $allowedBackgrounds, true)) {
            $background = '#0f766e';
        }
        if (text_length($caption) > 300) {
            fail('caption_too_long', 'Caption is too long', 422);
        }
        $attachmentId = null;
        $now = now();
        if ($kind === 'image') {
            $attachmentId = input_int('attachment_id');
            if (!$attachmentId) {
                fail('invalid_attachment', 'Missing story image', 422);
            }
            $attachment = get_attachment($attachmentId);
            if (!$attachment || (int) $attachment['user_id'] !== $uid || $attachment['kind'] !== 'image') {
                fail('invalid_attachment', 'Invalid story image', 422);
            }
            if ($attachment['used_at'] !== null) {
                fail('attachment_used', 'This image has already been used', 409);
            }
        } elseif ($caption === '') {
            fail('empty_story', 'Write something for your story', 422);
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO stories (user_id, kind, attachment_id, caption, background, created_at, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([$uid, $kind, $attachmentId, $caption, $background, $now, $now + (int) config('story_ttl')]);
            $storyId = (int) $pdo->lastInsertId();
            if ($attachmentId) {
                $pdo->prepare('UPDATE attachments SET used_at = ? WHERE id = ?')->execute([$now, $attachmentId]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        $stmt = $pdo->prepare('SELECT * FROM stories WHERE id = ?');
        $stmt->execute([$storyId]);
        ok(['story' => story_public($stmt->fetch(), true)], 201);
        break;

    case 'view':
        require_method('POST');
        require_csrf();
        $storyId = input_int('story_id');
        if (!$storyId) {
            fail('invalid_story', 'Missing story', 422);
        }
        $story = can_view_story($pdo, $storyId, $uid);
        if (!$story) {
            fail('not_found', 'Story not found or expired', 404);
        }
        if ((int) $story['user_id'] !== $uid) {
            $pdo->prepare(
                'INSERT INTO story_views (story_id, viewer_id, viewed_at) VALUES (?, ?, ?)
                 ON CONFLICT(story_id, viewer_id) DO UPDATE SET viewed_at = excluded.viewed_at'
            )->execute([$storyId, $uid, now()]);
        }
        ok(['seen' => true]);
        break;

    case 'viewers':
        require_method('GET');
        $storyId = input_int('story_id');
        if (!$storyId) {
            fail('invalid_story', 'Missing story', 422);
        }
        $stmt = $pdo->prepare('SELECT * FROM stories WHERE id = ?');
        $stmt->execute([$storyId]);
        $story = $stmt->fetch();
        if (!$story) {
            fail('not_found', 'Story not found', 404);
        }
        if ((int) $story['user_id'] !== $uid) {
            fail('forbidden', 'Only the owner can see viewers', 403);
        }
        $stmt = $pdo->prepare(
            'SELECT u.*, v.viewed_at FROM story_views v JOIN users u ON u.id = v.viewer_id
             WHERE v.story_id = ? ORDER BY v.viewed_at DESC LIMIT 200'
        );
        $stmt->execute([$storyId]);
        $viewers = [];
        foreach ($stmt->fetchAll() as $row) {
            $viewerData = public_user($row);
            $viewerData['viewed_at'] = (int) $row['viewed_at'];
            $viewers[] = $viewerData;
        }
        ok(['viewers' => $viewers]);
        break;

    case 'delete':
        require_method('POST');
        require_csrf();
        $storyId = input_int('story_id');
        if (!$storyId) {
            fail('invalid_story', 'Missing story', 422);
        }
        $stmt = $pdo->prepare('SELECT * FROM stories WHERE id = ?');
        $stmt->execute([$storyId]);
        $story = $stmt->fetch();
        if (!$story) {
            fail('not_found', 'Story not found', 404);
        }
        if ((int) $story['user_id'] !== $uid) {
            fail('forbidden', 'You can only delete your own stories', 403);
        }
        $pdo->prepare('DELETE FROM stories WHERE id = ?')->execute([$storyId]);
        if ($story['attachment_id']) {
            $a = get_attachment((int) $story['attachment_id']);
            if ($a && attachment_is_unreferenced((int) $a['id'])) {
                delete_stored_file($a['path']);
                $pdo->prepare('DELETE FROM attachments WHERE id = ?')->execute([(int) $a['id']]);
            }
        }
        ok(['deleted' => true]);
        break;

    default:
        fail('unknown_action', 'Unknown action', 404);
}
