<?php
declare(strict_types=1);

function config(?string $key = null, mixed $default = null): mixed
{
    static $config = null;
    if ($config === null) {
        $config = require dirname(__DIR__) . '/config.php';
    }
    if ($key === null) {
        return $config;
    }
    return $config[$key] ?? $default;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $path = config('db_path');
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('Cannot create data directory');
    }

    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA synchronous = NORMAL');

    migrate($pdo);
    return $pdo;
}

function migrate(PDO $pdo): void
{
    $version = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
    if ($version >= 1) {
        return;
    }

    $pdo->exec('BEGIN IMMEDIATE');
    try {
        $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    avatar_attachment_id INTEGER,
    lang TEXT NOT NULL DEFAULT 'ar',
    theme TEXT NOT NULL DEFAULT 'dark',
    accent TEXT NOT NULL DEFAULT 'teal',
    wallpaper TEXT NOT NULL DEFAULT 'default',
    last_seen INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    kind TEXT NOT NULL,
    duration_ms INTEGER,
    width INTEGER,
    height INTEGER,
    created_at INTEGER NOT NULL,
    used_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    ip TEXT NOT NULL,
    attempted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friendships (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (user1_id, user2_id),
    CHECK (user1_id < user2_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL,
    sticker TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    created_at INTEGER NOT NULL,
    read_at INTEGER
);

CREATE TABLE IF NOT EXISTS typing (
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL,
    caption TEXT NOT NULL DEFAULT '',
    background TEXT NOT NULL DEFAULT '#0f766e',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS story_views (
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at INTEGER NOT NULL,
    PRIMARY KEY (story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_following ON friendships(following_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_attempts_phone_time ON login_attempts(phone, ip, attempted_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON conversations(user1_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations(user2_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, sender_id, read_at);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer ON story_views(viewer_id);
SQL);
        $pdo->exec('PRAGMA user_version = 1');
        $pdo->exec('COMMIT');
    } catch (Throwable $e) {
        $pdo->exec('ROLLBACK');
        throw $e;
    }
}

function now(): int
{
    return time();
}

/** Low-cost database housekeeping, run occasionally. */
function maybe_gc(): void
{
    if (random_int(1, 100) !== 1) {
        return;
    }
    gc();
}

function gc(): void
{
    $pdo = db();
    $now = now();
    $pdo->prepare('DELETE FROM sessions WHERE expires_at < ?')->execute([$now]);
    $pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < ?')->execute([$now - 86400]);

    $expired = $pdo->prepare('SELECT id, attachment_id FROM stories WHERE expires_at <= ?');
    $expired->execute([$now]);
    $rows = $expired->fetchAll();
    if ($rows) {
        $del = $pdo->prepare('DELETE FROM stories WHERE id = ?');
        $att = $pdo->prepare('SELECT * FROM attachments WHERE id = ?');
        $attDel = $pdo->prepare('DELETE FROM attachments WHERE id = ?');
        foreach ($rows as $row) {
            $del->execute([$row['id']]);
            if ($row['attachment_id']) {
                $att->execute([$row['attachment_id']]);
                $a = $att->fetch();
                if ($a && attachment_is_unreferenced((int) $a['id'])) {
                    delete_stored_file($a['path']);
                    $attDel->execute([(int) $a['id']]);
                }
            }
        }
    }
}

function attachment_is_unreferenced(int $id, ?int $exceptAvatarUserId = null): bool
{
    $pdo = db();
    $q = $pdo->prepare('SELECT 1 FROM messages WHERE attachment_id = ? LIMIT 1');
    $q->execute([$id]);
    if ($q->fetchColumn()) {
        return false;
    }
    $q = $pdo->prepare('SELECT 1 FROM stories WHERE attachment_id = ? LIMIT 1');
    $q->execute([$id]);
    if ($q->fetchColumn()) {
        return false;
    }
    if ($exceptAvatarUserId !== null) {
        $q = $pdo->prepare('SELECT 1 FROM users WHERE avatar_attachment_id = ? AND id <> ? LIMIT 1');
        $q->execute([$id, $exceptAvatarUserId]);
    } else {
        $q = $pdo->prepare('SELECT 1 FROM users WHERE avatar_attachment_id = ? LIMIT 1');
        $q->execute([$id]);
    }
    return !$q->fetchColumn();
}

function delete_stored_file(string $relative): void
{
    $base = realpath(config('uploads_dir'));
    if ($base === false) {
        return;
    }
    $full = realpath($base . DIRECTORY_SEPARATOR . $relative);
    if ($full !== false && str_starts_with($full, $base . DIRECTORY_SEPARATOR) && is_file($full)) {
        @unlink($full);
    }
}
