@echo off
echo Starting game server...
echo.
echo Open on your iPhone: http://YOUR-PC-IP:8080
echo (Find your PC's IP: run "ipconfig" and look for IPv4 Address)
echo.
echo Press Ctrl+C to stop.
cd /d "%~dp0"
python -m http.server 8080
pause
