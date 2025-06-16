send_request() {
  curl \
    --request POST \
    --url http://localhost:13000/ \
    --silent \
    --show-error \
    --fail \
    --header 'Content-Type: application/json' \
    --header 'X-Discord-Webhook-Url: http://localhost:3001' \
    --data "{
      \"content\": \"$1\"
    }"
}

assert_content_length() {
  file="$1"
  expected="$2"
  content=$(jq --raw-output '.content' "./requests/$file")
  length=$(echo -n "$content" | wc -c)
  if [ "$length" -ne "$expected" ]; then
    echo "File :$file. Content length: $length, expected: $expected"
    exit 1
  fi
}

content=""
for i in $(seq 1 30); do
  content="${content}1234567890"
done

# send 14 requests, 300 characters each
for i in $(seq 1 14); do
  send_request "$content"
done

sleep 20

assert_content_length "0.json" "1805" # 6 lines
assert_content_length "1.json" "1805" # 6 lines
assert_content_length "2.json" "601"  # 2 lines
