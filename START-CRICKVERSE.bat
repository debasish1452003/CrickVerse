@echo off
title CrickVerse
cd /d "%~dp0"

echo ============================================
echo            Starting CrickVerse
echo ============================================
echo.
echo Database: Neon cloud (no local DB needed)
echo.

REM --- Open the site in the browser shortly after the server boots ---
echo The site will open automatically at http://localhost:3000
start "" /b cmd /c "timeout /t 12 >nul & start http://localhost:3000"
echo.

REM --- Start the web app (leave this window open while using the app) ---
echo Starting the web app...  (Keep this window OPEN. Press Ctrl+C to stop.)
echo.
call pnpm --filter @crickverse/web dev

echo.
echo CrickVerse stopped. Press any key to close.
pause >nul
