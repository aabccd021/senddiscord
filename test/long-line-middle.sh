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

content="12345\n"
for i in $(seq 1 201); do
  content="${content}1234567890"
done

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

sleep 8

assert_content_length "0.json" "5"
assert_content_length "1.json" "2000"
assert_content_length "2.json" "10"
