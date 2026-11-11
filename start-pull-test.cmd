@echo off
cd /d "%~dp0"
set PORT=3215
echo Open http://localhost:3215/pull-test
node scripts/launch-lab.mjs
pause
