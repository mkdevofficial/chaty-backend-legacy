<?php
declare(strict_types=1);

date_default_timezone_set('UTC');
ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/response.php';
require_once __DIR__ . '/validation.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/upload.php';

set_exception_handler(function (Throwable $e): void {
    error_log('[Chaty] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        fail('server_error', 'Unexpected server error', 500);
    }
    echo json_encode(['ok' => false, 'error' => ['code' => 'server_error', 'message' => 'Unexpected server error']]);
    exit;
});

// Make sure the schema exists before handling the request.
db();
maybe_gc();
