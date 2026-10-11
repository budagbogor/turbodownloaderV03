@echo off
title TurboDownloader Server
echo =======================================
echo     Memulai TurboDownloader Server...
echo =======================================
echo.
cd /d "%~dp0"
call npm run dev
pause
