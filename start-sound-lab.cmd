@echo off
cd /d "%~dp0"
echo Sound preview: http://localhost:3216/sound-lab.html
node scripts\sound-lab-server.mjs
pause
