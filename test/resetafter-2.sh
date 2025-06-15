cat >response.json <<EOF
[
  {
    "status": 200,
    "headers": {
      "X-RateLimit-Reset-After": 3
    },
    "body": {}
  },
  {
    "status": 200,
    "headers": {
      "X-RateLimit-Reset-After": 3
    },
    "body": {}
  },
  {
    "status": 200,
    "headers": {
      "X-RateLimit-Reset-After": 3
    },
    "body": {}
  }
]
EOF

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

sleep 9.5

assert_content "0.json" "Lorem"
assert_content "1.json" "Ipsum"

if [ -f "./requests/2.json" ]; then
  echo "File 2.json should not exist"
  exit 1
fi
