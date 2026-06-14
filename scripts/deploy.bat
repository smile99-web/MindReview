@echo off
setlocal enabledelayedexpansion
set SERVER=root@14.103.219.117
set REMOTE_DIR=/opt/mindreview

echo ============================================
echo   MindReview - Build + Deploy + Push
echo ============================================
echo.

:: 1. Build Next.js locally
echo [1/4] Building Next.js...
call npx next build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Build failed!
    exit /b 1
)
echo       Build OK

:: 2. Upload to VPS and restart
echo [2/4] Deploying to VPS...
(
  tar --exclude='node_modules' --exclude='.git' -czf - ^
    .next/standalone .next/static public prisma package.json
) | ssh %SERVER% "cd %REMOTE_DIR% && tar -xzf - && mkdir -p .next/standalone/MindReview/.next 2>nul && cp -r .next/static .next/standalone/MindReview/.next/static && cp -r public .next/standalone/ && npx prisma generate 2>/dev/null && pm2 restart mindreview"
echo       VPS deploy OK

:: 3. Git commit
echo [3/4] Committing to git...
git add -A
git diff --cached --quiet
if %ERRORLEVEL% equ 0 (
    echo       Nothing to commit
) else (
    set /p COMMIT_MSG="       Enter commit message (or press Enter for default): "
    if "!COMMIT_MSG!"=="" set COMMIT_MSG=Update: code changes
    git commit -m "!COMMIT_MSG!"
    echo       Committed
)

:: 4. Push to GitHub
echo [4/4] Pushing to GitHub...
git push origin main
echo       Push OK

echo.
echo ============================================
echo   Done - http://14.103.219.117
echo   Repo - https://github.com/smile99-web/MindReview
echo ============================================
