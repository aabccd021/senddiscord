#!/bin/sh

set -eu

webhook_url=$(cat "$WEBHOOK_URL_FILE")

mkdir -p /var/lib/senddiscord
if [ ! -f /var/lib/senddiscord/messages.txt ]; then
  touch /var/lib/senddiscord/messages.txt
fi

chmod 0777 /var/lib/senddiscord
chmod 0666 /var/lib/senddiscord/messages.txt

running=1
trap 'running=0' TERM

while [ "$running" -eq 1 ]; do
  sleep 2

  content=$(head -n 1 /var/lib/senddiscord/messages.txt || true)
  if [ -z "$content" ]; then
    sleep 10
    continue
  fi

  content=$(echo "$content" | head -c 1900 | jq --raw-input --slurp --raw-output '@json')

  status=$(
    curl \
      --request POST \
      --url "$webhook_url" \
      --silent \
      --show-error \
      --fail \
      --header 'Content-Type: application/json' \
      --data "{ \"content\": $content }" \
      --write-out '%{http_code}' \
      --output /dev/null ||
      echo "000"
  )

  if [ "$status" = "429" ]; then
    echo "Rate limited, retrying in 60 seconds..." >&2
    sleep 60
  else
    if [ "$status" != "204" ]; then
      echo "Failed to send message, status: $status, content: $content" >&2
    fi
    sed -i '1d' /var/lib/senddiscord/messages.txt
  fi
done
