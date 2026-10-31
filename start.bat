@echo off
REM Starts the ResearchX backend (port 8000) and frontend (port 5173) in two windows.
set PYTHONIOENCODING=utf-8
set HF_HUB_DISABLE_SYMLINKS_WARNING=1
start "ResearchX backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --port 8000"
start "ResearchX frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 6 >nul
start http://localhost:5173
