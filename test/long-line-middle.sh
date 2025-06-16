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

assert_content() {
  file="$1"
  expected_message="$(printf "$2")"
  content=$(jq --raw-output '.content' "./requests/$file")

  if [ "$content" != "$expected_message" ]; then
    echo "File $file does not contain expected content: $expected_message"
    echo "Actual content: $content"
    exit 1
  fi

}

content="12345\n"
for i in $(seq 1 201); do
  content="${content}1234567890"
done

send_request "Sit Amet" # 8 chars
send_request "$content"
send_request "Fuga" # 4 chars

sleep 8

assert_content "0.json" "Sit Amet\n12345"
assert_content_length "1.json" "2000"
assert_content "2.json" "1234567890\nFuga"
