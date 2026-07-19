@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "PORT=5000"
set "URL=http://localhost:%PORT%"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  echo Install Node.js LTS from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo Production build not found. Building now...
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)

REM If the API is already up, just open the browser.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%URL%/api/company' -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  start "" "%URL%"
  exit /b 0
)

echo Starting MediCare Pharmacy Billing on %URL% ...
start "MediCare Pharmacy Billing" /MIN cmd /c "node server\server.js"

REM Wait until the server responds (max ~30s)
set /a tries=0
:waitloop
set /a tries+=1
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing '%URL%/api/company' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto ready
if %tries% GEQ 30 goto failed
timeout /t 1 /nobreak >nul
goto waitloop

:ready
start "" "%URL%"
exit /b 0

:failed
echo Server did not start in time. Check that port %PORT% is free.
pause
exit /b 1
