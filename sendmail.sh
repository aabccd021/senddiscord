#!/bin/sh

set -eu

stdin=$(mktemp)
trap 'rm -f "$stdin"' EXIT

cat >"$stdin"

webhook_url=$(cat "$WEBHOOK_URL_FILE")

sqlite3 /var/lib/senddiscord/db.sqlite '
  INSERT INTO messages (webhook_url, content) 
  VALUES (
    "'"$webhook_url"'",
    CAST(readfile("'"$stdin"'") AS TEXT)
  );
'
