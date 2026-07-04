#!/bin/zsh

# 切换到 admin 文件夹
cd "$(dirname "$0")"

clear
echo "==========================================="
echo "      Yiichen de Lajii Admin Dashboard"
echo "==========================================="
echo ""
echo "Starting Node server..."
echo ""

# 后台启动 Node Server
node js/node-server.js &
SERVER_PID=$!

# 等待 8790 端口真的开始监听，再打开浏览器
echo "Waiting for server on http://127.0.0.1:8790 ..."

until nc -z 127.0.0.1 8790; do
  sleep 0.2
done

echo "Opening browser..."
open "http://127.0.0.1:8790/"

echo ""
echo "==========================================="
echo "Admin Dashboard Running"
echo ""
echo "Local:"
echo "http://127.0.0.1:8790/"
echo ""
echo "Press Ctrl + C to stop the server."
echo "==========================================="
echo ""

# 等待 Node 结束
wait $SERVER_PID