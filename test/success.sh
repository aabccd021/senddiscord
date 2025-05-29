curl \
  --request POST \
  --url http://localhost/ \
  --unix-socket ./server.sock \
  --silent \
  --show-error \
  --fail \
  --header 'Content-Type: application/json' \
  --header 'X-Discord-Webhook-Url: https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' \
  --data '{
    "content": "hello"
  }'
