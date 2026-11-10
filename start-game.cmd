@echo off
cd /d "%~dp0"
set PORT=3214
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not available. Install Node.js LTS from nodejs.org before running.
  pause
  exit /b 1
)
if not exist node_modules\three\package.json (
  echo Project dependencies are missing. Run npm ci in this folder once.
  pause
  exit /b 1
)
echo.
echo Beyblade Party - local event server
 echo Open http://localhost:3214 in Chrome or Edge.
echo Keep this window open during the event. Press Ctrl+C to stop.
echo.
node server.mjs
pause