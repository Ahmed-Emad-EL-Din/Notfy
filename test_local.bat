@echo off
echo ==============================================
echo   Notfy Local Testing Script
echo ==============================================
echo.

echo [1/3] Checking TypeScript types...
call npm run lint
if %errorlevel% neq 0 (
  echo LINT FAILED! Please fix errors before deploying.
  pause
  exit /b %errorlevel%
)
echo Lint passed!
echo.

echo [2/3] Building frontend for production...
call npm run build
if %errorlevel% neq 0 (
  echo BUILD FAILED!
  pause
  exit /b %errorlevel%
)
echo Build successful!
echo.

echo [3/3] Starting Netlify Dev Server...
echo This will simulate the production environment (both frontend and serverless functions).
echo Make sure your .env file is set up with VITE_MONGODB_URI.
echo Press Ctrl+C to exit when you're done testing.
echo.
call npx netlify dev
