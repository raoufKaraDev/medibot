@echo off
echo ========================================
echo   MediBot — Demarrage du systeme
echo ========================================

echo [1] Demarrage Mosquitto MQTT Broker...
start "MQTT Broker" cmd /k "cd /d C:\Program Files\mosquitto && mosquitto -c C:\ROBOT_MED\mosquitto\mosquitto.conf -v"
timeout /t 2 >nul

echo [2] Demarrage Backend FastAPI...
start "FastAPI Backend" cmd /k "cd /d C:\ROBOT_MED\backend && pip install -r requirements.txt -q && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 3 >nul

echo [3] Demarrage Frontend React...
start "React Frontend" cmd /k "cd /d C:\ROBOT_MED\frontend && npm run dev"

echo.
echo Systeme demarre!
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:8000
echo   MQTT:      127.0.0.1:1883 (TCP) + 9001 (WebSocket)
echo.
pause