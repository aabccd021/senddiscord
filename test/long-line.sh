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

# generate content with length 2010 characters
content=""
for i in $(seq 1 201); do
  content="1234567890$content"
done

curl \
  --request POST \
  --url http://localhost:3000/ \
  --silent \
  --show-error \
  --fail \
  --header 'Content-Type: application/json' \
  --header 'X-Discord-Webhook-Url: http://localhost:3001' \
  --data "{
      \"content\": \"$content\"
    }"

sleep 6

assert_content_length "0.json" "2000"
assert_content_length "1.json" "10"
