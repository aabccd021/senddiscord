curl \
  --request POST \
  --url http://localhost/ \
  --unix-socket ./server.sock \
  --silent \
  --show-error \
  --fail \
  --header 'Content-Type: application/json' \
  --data '{
    "webhookUrl": "https://blabla.com",
    "message": "hello"
  }'
