#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PORT="${PORT:-8080}"
WORKERS="${WORKERS:-4}"

mkdir -p data uploads
chmod 775 data uploads 2>/dev/null || true

# The first run seeds two demo accounts so the app can be tried immediately.
php seed.php --if-empty

export PHP_CLI_SERVER_WORKERS="$WORKERS"
echo "Chaty is running at http://localhost:${PORT} (${WORKERS} workers)"
echo "Demo login: +15550000001 / chaty1234"
exec php \
  -d upload_max_filesize=25M \
  -d post_max_size=28M \
  -d max_file_uploads=10 \
  -S "0.0.0.0:${PORT}" \
  -t public router.php
