@echo off
echo ============================================
echo   PRD Deployment Script for Windows Server
echo ============================================
echo.

:: Step 1 — Check Node.js
echo [1/5] Checking Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please download from https://nodejs.org
    pause
    exit /b 1
)
echo OK - Node.js found.
echo.

:: Step 2 — Clone or pull repo
echo [2/5] Getting latest code...
if exist "C:\PRD" (
    cd /d C:\PRD
    git pull
) else (
    git clone https://github.com/billwuatenlab/PRD.git C:\PRD
    cd /d C:\PRD
)
echo.

:: Step 3 — Install and build client
echo [3/5] Building frontend...
cd /d C:\PRD\app\client
call npm install
call npm run build
echo.

:: Step 4 — Install and build server
echo [4/5] Building backend...
cd /d C:\PRD\app\server
call npm install
call npx tsc
echo.

:: Step 5 — Start server
echo [5/5] Starting PRD server...
echo ============================================
echo   PRD is running at http://localhost:3002
echo   Press Ctrl+C to stop
echo ============================================
node dist/index.js
