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
echo [1/5] Checking dependencies...
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
echo [2/5] Checking .env file...
if not exist ".env" (
    echo  [WARNING] .env file not found!
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  * .env created from template. Fill in your values before testing!
    ) else (
        echo  [ERROR] .env.example also not found. Cannot continue.
        pause
        exit /b 1
    )
) else (
    echo  * .env file found.
)
echo.

REM ---- Step 3: Pre-flight check of required env variables ----
echo [3/5] Checking environment variables...
set MISSING=0

REM Read .env and check each key
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if "%%A"=="VITE_MONGODB_URI"               if "%%B"=="" ( echo  [MISSING] VITE_MONGODB_URI & set MISSING=1 )
    if "%%A"=="VITE_FIREBASE_API_KEY"          if "%%B"=="" ( echo  [MISSING] VITE_FIREBASE_API_KEY & set MISSING=1 )
    if "%%A"=="VITE_FIREBASE_AUTH_DOMAIN"      if "%%B"=="" ( echo  [MISSING] VITE_FIREBASE_AUTH_DOMAIN & set MISSING=1 )
    if "%%A"=="VITE_FIREBASE_PROJECT_ID"       if "%%B"=="" ( echo  [MISSING] VITE_FIREBASE_PROJECT_ID & set MISSING=1 )
    if "%%A"=="VITE_FIREBASE_APP_ID"           if "%%B"=="" ( echo  [MISSING] VITE_FIREBASE_APP_ID & set MISSING=1 )
    if "%%A"=="VITE_CLOUDINARY_CLOUD_NAME"     if "%%B"=="" ( echo  [MISSING] VITE_CLOUDINARY_CLOUD_NAME & set MISSING=1 )
    if "%%A"=="VITE_CLOUDINARY_UPLOAD_PRESET"  if "%%B"=="" ( echo  [MISSING] VITE_CLOUDINARY_UPLOAD_PRESET & set MISSING=1 )
    if "%%A"=="VAPID_PUBLIC_KEY"               if "%%B"=="" ( echo  [MISSING] VAPID_PUBLIC_KEY & set MISSING=1 )
    if "%%A"=="VAPID_PRIVATE_KEY"              if "%%B"=="" ( echo  [MISSING] VAPID_PRIVATE_KEY & set MISSING=1 )
)

if "%MISSING%"=="1" (
    echo.
    echo  [WARNING] Some variables above are empty. Features depending on them
    echo  may not work. Edit your .env file and fill them in, then re-run.
    echo.
    choice /C YN /M "Continue anyway"
    if errorlevel 2 exit /b 0
) else (
    echo  * All required environment variables are set!
)
echo.

REM ---- Step 4: Check if Netlify CLI is installed globally ----
echo [4/5] Checking Netlify CLI...
where netlify >nul 2>&1
if %errorlevel% neq 0 (
    echo  * Netlify CLI not found. Installing globally...
    call npm install -g netlify-cli >nul 2>&1
    where netlify >nul 2>&1
    if %errorlevel% neq 0 (
        echo  [ERROR] Netlify CLI still not found after install.
        echo  Try manually running: npm install -g netlify-cli
        pause
        exit /b 1
    )
    echo  * Netlify CLI installed successfully.
) else (
    echo  * Netlify CLI found.
)
echo.

REM ---- Step 5: Launch netlify dev ----
echo [5/5] Starting local server...
echo.
echo  =============================================
echo   SERVICES RUNNING:
echo   Frontend + API  ^>  http://localhost:8888
echo   API endpoint    ^>  http://localhost:8888/.netlify/functions/api
echo  =============================================
echo.
echo   WHAT YOU CAN TEST:
echo   [OK] Google + Email Login      (Firebase)
echo   [OK] Task creation / deletion  (MongoDB)
echo   [OK] Image uploads in tasks    (Cloudinary)
echo   [OK] Admin panel + invite link
echo   [OK] Telegram connect button
echo   [--] Background push cron      (Netlify only - not local)
echo.
echo   Press Ctrl+C to stop at any time.
echo  =============================================
echo.

call netlify dev

echo.
echo  [Server stopped]
pause
