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

for file in $(ls ./requests); do
  content=$(jq --raw-output '.content' "./requests/$file")
  if [ "$content" != "hello" ]; then
    echo "File :$file. Content: $content"
  fi
done
