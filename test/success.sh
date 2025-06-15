curl \
  --request POST \
  --url http://localhost/ \
  --unix-socket ./server.sock \
  --silent \
  --show-error \
  --fail \
  --header 'Content-Type: application/json' \
  --header 'X-Discord-Webhook-Url: http://localhost:3000' \
  --data '{
    "content": "hello"
  }'

sleep 5

cat ./request.json

content=$(jq --raw-output '.content' ./request.json)
if [ "$content" != "hello" ]; then
  echo "Expected content 'hello', got '$content'"
fi
