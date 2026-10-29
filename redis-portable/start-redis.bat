@echo off
cd /d "%~dp0"
redis-server.exe redis.windows.conf --bind 127.0.0.1 --port 6379
