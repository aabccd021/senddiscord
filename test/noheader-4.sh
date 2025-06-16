send_request() {
  content="$1"
  curl \
    --request POST \
    --url http://localhost/ \
    --unix-socket ./server.sock \
    --silent \
    --show-error \
    --fail \
    --header 'Content-Type: application/json' \
    --header 'X-Discord-Webhook-Url: http://localhost:3000' \
    --data "{
      \"content\": \"$content\"
    }"
}

assert_content() {
  file="$1"
  expected="$2"
  content=$(jq --raw-output '.content' "./requests/$file")
  if [ "$content" != "$expected" ]; then
    echo "File :$file. Content: $content"
    exit 1
  fi
}

send_request "Lorem"
send_request "Ipsum"
send_request "Dolor"
send_request "Sit Amet"

sleep 10
assert_content "3.json" "Sit Amet"
