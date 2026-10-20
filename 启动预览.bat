@echo off
rem 双击此文件即可在浏览器里预览 App（手机画面比例）
cd /d %~dp0
start "EnglishQuest-Preview" "D:\SC2地图工坊\py\python.exe" -m http.server 8123 --bind 127.0.0.1
start "" "http://127.0.0.1:8123/index.html"
echo 预览已启动！浏览器没有自动打开的话，请访问 http://127.0.0.1:8123/index.html
echo 关闭弹出的预览窗口即可停止。
timeout /t 5 >nul
