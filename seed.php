<?php
declare(strict_types=1);

require __DIR__ . '/src/db.php';

$ifEmpty = in_array('--if-empty', $argv ?? [], true);
$pdo = db();
$count = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();

if ($count > 0) {
    if ($ifEmpty) {
        exit(0);
    }
    echo "Database already has users; demo accounts were not changed.\n";
    exit(0);
}

$now = now();
$password = password_hash('chaty1234', PASSWORD_DEFAULT);

$insert = $pdo->prepare(
    'INSERT INTO users (phone, username, display_name, bio, password_hash, theme, accent, lang, created_at, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

$insert->execute([
    '+15550000001', 'layla', 'ليلى', 'مرحباً! هذه ليلى. أحب القهوة والتصوير ☕📷',
    $password, 'dark', 'teal', 'ar', $now, $now,
]);
$layla = (int) $pdo->lastInsertId();

$insert->execute([
    '+15550000002', 'omar', 'عمر', 'Hey there, I am Omar. Always up for a good conversation.',
    $password, 'light', 'violet', 'en', $now, $now - 300,
]);
$omar = (int) $pdo->lastInsertId();

$follow = $pdo->prepare('INSERT OR IGNORE INTO friendships (follower_id, following_id, created_at) VALUES (?, ?, ?)');
$follow->execute([$layla, $omar, $now]);
$follow->execute([$omar, $layla, $now]);

$a = min($layla, $omar);
$b = max($layla, $omar);
$pdo->prepare('INSERT INTO conversations (user1_id, user2_id, created_at, updated_at) VALUES (?, ?, ?, ?)')
    ->execute([$a, $b, $now - 3600, $now - 120]);
$conversation = (int) $pdo->lastInsertId();

$message = $pdo->prepare(
    'INSERT INTO messages (conversation_id, sender_id, type, body, sticker, status, created_at, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
$message->execute([$conversation, $layla, 'text', 'أهلاً عمر! كيف حالك؟', null, 'read', $now - 600, $now - 580]);
$message->execute([$conversation, $omar, 'text', 'I am good, thanks! Welcome to Chaty 👋', null, 'read', $now - 400, $now - 390]);
$message->execute([$conversation, $omar, 'sticker', '', 'faces/happy.svg', 'delivered', $now - 120, null]);

$story = $pdo->prepare(
    'INSERT INTO stories (user_id, kind, caption, background, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
);
$story->execute([$layla, 'text', 'ابدأ يومك بابتسامة ✨', '#7c3aed', $now - 1800, $now + 86400 - 1800]);
$story->execute([$omar, 'text', 'Coffee first. ☕', '#0f766e', $now - 900, $now + 86400 - 900]);

echo "Demo accounts created:\n";
echo "  Layla — phone +15550000001, username @layla, password chaty1234 (Arabic UI)\n";
echo "  Omar  — phone +15550000002, username @omar,  password chaty1234 (English UI)\n";
