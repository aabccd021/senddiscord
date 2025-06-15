yellow=$(printf '\033[33m')
blue=$(printf '\033[34m')
cyan=$(printf '\033[36m')
reset=$(printf '\033[0m')

NOTIFY_SOCKET="$PWD/notify.sock"
export NOTIFY_SOCKET

mkfifo ./systemd_notify_ready.fifo
systemd-notify-fifo-server \
  -out ./systemd_notify.fifo \
  -ready ./systemd_notify_ready.fifo &
cat ./systemd_notify_ready.fifo

mkfifo ./discord.fifo
sed "s/^/${cyan}[discord]${reset} /" ./discord.fifo &

mock-discord-webhook 2>&1 >discord.fifo &

mkfifo ./server.fifo
sed "s/^/${blue}[server]${reset} /" ./server.fifo &

# direct pipe will not forward signals to the server, so we use a fifo
discord-webhook-dispatcher \
  --db ./db.sqlite \
  --socket ./server.sock \
  2>&1 >server.fifo &
server_pid=$!

while true; do
  result=$(cat ./systemd_notify.fifo)
  if [ "$result" = "READY=1" ]; then
    break
  fi
done

bash -euo pipefail "$TEST_FILE" 2>&1 | sed "s/^/${yellow}[test]${reset} /"

# simulate systemctl stop
kill -SIGTERM "$server_pid"
wait "$server_pid"

mkdir "$out"
