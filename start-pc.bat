@echo off
cd /d "%~dp0"
start "Caissa PC" cmd /k node tools\dev-server.js
timeout /t 2 >nul
start "" http://127.0.0.1:8765/
