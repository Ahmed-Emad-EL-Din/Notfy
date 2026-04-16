@echo off
title RelaySignal - Local Dev Server
color 0A
cls

echo.
echo  =============================================
echo   RelaySignal Local Development Launcher
echo  =============================================
echo.

REM ---- Step 1: Check if node_modules exist ----
echo [1/4] Checking dependencies...
if not exist "node_modules\" (
    echo  * node_modules not found. Running npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install failed. Make sure Node.js is installed.
        pause
        exit /b 1
    )
    echo  * Dependencies installed successfully.
) else (
    echo  * node_modules found. Skipping install.
)
echo.

REM ---- Step 2: Check .env file ----
echo [2/4] Checking .env file...
if not exist ".env" (
    echo  [WARNING] .env file not found!
    echo  * Copying .env.example to .env for you...
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  * .env created from template. Please fill in your values before testing API calls!
    ) else (
        echo  [ERROR] .env.example also not found. Cannot continue.
        pause
        exit /b 1
    )
) else (
    echo  * .env file found.
)
echo.

REM ---- Step 3: Check if Netlify CLI is installed globally ----
echo [3/4] Checking Netlify CLI...
where netlify >nul 2>&1
if %errorlevel% neq 0 (
    echo  * Netlify CLI not found. Installing globally...
    call npm install -g netlify-cli >nul 2>&1
    REM Re-check after install instead of trusting npm exit code
    where netlify >nul 2>&1
    if %errorlevel% neq 0 (
        echo  [ERROR] Netlify CLI still not found after install.
        echo  Try manually running: npm install -g netlify-cli
        echo  Then re-run this batch file.
        pause
        exit /b 1
    )
    echo  * Netlify CLI installed successfully.
) else (
    echo  * Netlify CLI found.
)
echo.

REM ---- Step 4: Launch netlify dev ----
echo [4/4] Starting local server with netlify dev...
echo.
echo  IMPORTANT:
echo  - Frontend (Vite)  runs on http://localhost:8888
echo  - API Functions    run on http://localhost:8888/.netlify/functions/api
echo  - Cron jobs do NOT run locally. Test them manually via the URL above.
echo  - Fill in your .env file for API calls to MongoDB, Telegram, etc to work.
echo.
echo  Press Ctrl+C to stop the server at any time.
echo.
echo  =============================================
echo.

call netlify dev

echo.
echo  [Server stopped]
pause
