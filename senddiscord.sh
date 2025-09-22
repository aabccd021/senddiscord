#!/bin/sh

set -eu

webhook_url=$(cat "$WEBHOOK_URL_FILE")

mkdir -p /var/lib/senddiscord
if [ ! -e /var/lib/senddiscord/messages.txt ]; then
  touch /var/lib/senddiscord/messages.txt
fi

chmod -R u=rwX /var/lib/senddiscord

running=1
trap 'running=0' TERM

while [ "$running" -eq 1 ]; do
  sleep 2

  if [ ! -s /var/lib/senddiscord/messages.txt ]; then
    sleep 10
    continue
  fi

  content=$(
    head -n 1 /var/lib/senddiscord/messages.txt |
      head -c 1900 |
      jq --raw-input --slurp --raw-output '@json'
  )

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
    continue
  fi

  if [ "$status" != "204" ]; then
    echo "Failed to send message, status: $status, content: $content" >&2
  fi

  sed -i '1d' /var/lib/senddiscord/messages.txt
done
