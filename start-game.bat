@echo off
rem ============================================================
rem  Clocktower Nights - double-click to start the game and the
rem  permanent ngrok link. Close the two windows it opens to stop.
rem ============================================================
cd /d "%~dp0"

rem Your ngrok domain is kept in ngrok-domain.txt (not uploaded to GitHub).
if not exist ngrok-domain.txt (
  echo.
  echo First time setup: type your free ngrok domain, for example
  echo   my-name-1234.ngrok-free.dev
  echo.
  set /p NGROK_DOMAIN=Your ngrok domain: 
  call echo %%NGROK_DOMAIN%%> ngrok-domain.txt
)
set /p NGROK_DOMAIN=<ngrok-domain.txt

rem Find ngrok: installed with winget, or ngrok.exe placed in this folder.
set NGROK=ngrok
where ngrok >nul 2>nul || (
  if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ngrok.exe" set NGROK="%LOCALAPPDATA%\Microsoft\WinGet\Links\ngrok.exe"
  if exist "%~dp0ngrok.exe" set NGROK="%~dp0ngrok.exe"
)

echo.
echo Building the game (a few seconds)...
call npm run build || (echo Build failed - see the messages above. & pause & exit /b 1)

start "Clocktower Nights - game (keep open)" cmd /k "npm start"
timeout /t 5 /nobreak >nul
start "Clocktower Nights - public link (keep open)" cmd /k "%NGROK% http --domain=%NGROK_DOMAIN% 3001"

echo.
echo ============================================================
echo  Your game is starting. Share this link with your friends:
echo.
echo    https://%NGROK_DOMAIN%
echo.
echo  Keep the two new windows open while you play.
echo  To stop: close both windows.
echo ============================================================
echo.
pause
