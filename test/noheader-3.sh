# prefix with length 1500 characters so each message will be sent separately
prefix=""
for i in $(seq 1 150); do
  prefix="${prefix}1234567890"
done

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
      \"content\": \"$prefix$content\"
    }"
}

assert_content() {
  file="$1"
  expected_length="$2"
  expected_ending="$3"

  content=$(jq --raw-output '.content' "./requests/$file")

  length=$(echo -n "$content" | wc -c)
  if [ "$length" -ne "$expected_length" ]; then
    echo "Unexpected length of file $file: $length"
    exit 1
  fi

  # compare ending using posix shell
  if ! echo "$content" | grep -q "${expected_ending}$"; then
    echo "File $file does not end with $expected_ending"
    exit 1
  fi

}

send_request "Lorem"
send_request "Ipsum"
send_request "Dolor"
send_request "Sit Amet"

sleep 7.5

assert_content "0.json" 1505 "Lorem"
assert_content "1.json" 1505 "Ipsum"
assert_content "2.json" 1505 "Dolor"

if [ -f "./requests/3.json" ]; then
  echo "File 3.json should not exist"
  exit 1
fi
