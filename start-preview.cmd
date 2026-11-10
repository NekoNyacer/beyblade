@echo off
cd /d "%~dp0"
set PORT=3214
echo Open http://localhost:3214/scenarios
node scripts/preview.mjs
pause
