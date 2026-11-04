<?php
/**
 * Chaty — central configuration.
 * Edit values here; no other file needs changing for normal operation.
 */
return [
    'app_name' => 'Chaty',

    // Database and storage (both live outside the public web root).
    'db_path' => __DIR__ . '/data/chaty.sqlite',
    'uploads_dir' => __DIR__ . '/uploads',

    // Upload limits in bytes.
    'max_image_size' => 10 * 1024 * 1024,   // 10 MB
    'max_audio_size' => 10 * 1024 * 1024,   // 10 MB
    'max_file_size'  => 25 * 1024 * 1024,   // 25 MB

    // Allowed real MIME types (validated with finfo, never by extension).
    'image_mimes' => [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
        'image/gif'  => 'gif',
    ],
    'audio_mimes' => [
        'audio/webm' => 'webm',
        'audio/ogg'  => 'ogg',
        'audio/mp4'  => 'm4a',
        'audio/mpeg' => 'mp3',
        'audio/wav'  => 'wav',
        'audio/x-wav' => 'wav',
        'audio/aac'  => 'aac',
    ],
    'file_mimes' => [
        'application/pdf' => 'pdf',
        'application/zip' => 'zip',
        'application/x-zip-compressed' => 'zip',
        'application/gzip' => 'gz',
        'application/x-rar-compressed' => 'rar',
        'application/x-7z-compressed' => '7z',
        'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.ms-excel' => 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'application/vnd.ms-powerpoint' => 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
        'text/plain' => 'txt',
        'text/csv' => 'csv',
        'application/json' => 'json',
        'application/octet-stream' => 'bin',
    ],

    // Sessions / security.
    'session_cookie' => 'chaty_session',
    'session_lifetime' => 60 * 60 * 24 * 30, // 30 days
    'login_max_attempts' => 8,
    'login_window' => 15 * 60,              // 15 minutes
    'story_ttl' => 60 * 60 * 24,            // 24 hours
    'max_text_message' => 5000,
    'max_bio' => 150,
];
