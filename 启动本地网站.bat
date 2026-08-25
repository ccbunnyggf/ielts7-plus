@echo off
setlocal
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未找到 pnpm。请先安装 Node.js 22 和 pnpm，然后重新双击此文件。
  echo 安装说明：https://nodejs.org/
  pause
  exit /b 1
)

start "IELTS7+ Local" cmd /c "timeout /t 3 /nobreak >nul ^& start \"\" http://localhost:3000"
pnpm dev

