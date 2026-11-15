@echo off
REM Ortho Diamond - local / same-Wi-Fi start (no Docker, no ngrok).
REM Opens 3 windows: Backend :4100, Doctor web :3100, Gateway :8100 (also serves the built admin).
setlocal
set ROOT=%~dp0..
cd /d "%ROOT%"

net start postgresql-x64-17 >nul 2>&1

echo Building admin panel...
pushd "%ROOT%\FE\admin"
call npm run build || (echo Admin build failed & popd & exit /b 1)
popd

start "OD Backend :4100" cmd /k "cd /d "%ROOT%\BE" && npx prisma migrate deploy && npm run dev"
start "OD Web :3100" cmd /k "cd /d "%ROOT%\FE\web" && npm run dev -- -p 3100"
start "OD Gateway :8100" cmd /k "cd /d "%ROOT%" && node scripts\gateway.mjs"

echo.
echo Started. Open http://localhost:8100  (admin: http://localhost:8100/admin/)
echo From a phone on the same Wi-Fi use the "Same Wi-Fi" URL printed in the Gateway window.
endlocal
