#!/bin/sh

set -eu

webhook_url=$(cat "$WEBHOOK_URL_FILE")

mkdir -p /var/lib/senddiscord
if [ ! -f /var/lib/senddiscord/messages.txt ]; then
  touch /var/lib/senddiscord/messages.txt
fi

# everyone can read and write, no one can execute
chmod 0666 /var/lib/senddiscord/messages.txt

running=1
trap 'running=0' TERM

while [ "$running" -eq 1 ]; do
  sleep 2

  content=$(head -n 1 /var/lib/senddiscord/messages.txt || true)
  if [ -z "$content" ]; then
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
    echo "Rate limited, retrying in 60 seconds..."
    sleep 60
  else
    sed -i '1d' /var/lib/senddiscord/messages.txt
  fi
done
