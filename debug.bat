@echo off
Echo 查看处理过程 > debug.log
Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path >> debug.log
Echo 正在清理缓存和重启服务器...
Copy app\api\chat\route.ts chat_backup.ts
Echo 复制备份完成