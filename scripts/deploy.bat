@echo off
setlocal
set SERVER=root@14.103.219.117
set REMOTE_DIR=/opt/mindreview

echo ============================================
echo   MindReview - Safe Deploy (VPS build)
echo ============================================
echo.
echo 流程：本地类型检查 -^> tar 源码上传 -^> VPS 装依赖+migrate
echo       -^> VPS 内存限制构建 -^> 静态文件就位 -^> pm2 重启+健康检查
echo.
echo 注意：绝不在 Windows 本地 next build（prisma 二进制平台不匹配，
echo       Linux 上跑不起来）；VPS 仅 2GB 内存，构建必须 systemd-run
echo       内存限制（裸 build 曾两次 OOM 压垮整机）。git 提交/推送
echo       不在本脚本内，请先在 Git Bash 完成 commit/push。
echo.

echo [1/5] Type check (tsc --noEmit)...
call npx tsc --noEmit
if %ERRORLEVEL% neq 0 (
    echo ERROR: Type check failed!
    exit /b 1
)
echo       Type check OK

echo [2/5] Uploading source to VPS...
:: 整树打包（排除产物/密钥/数据），VPS 端先清旧源码防残留；
:: .env 永不上传，VPS 上的 /opt/mindreview/.env 保持不变
(tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env --exclude=data --exclude=public/uploads --exclude=BUG-AUDIT-*.md -czf - .) | ssh %SERVER% "cd %REMOTE_DIR% && rm -rf src prisma scripts public && tar -xzf -"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Upload failed!
    exit /b 1
)
echo       Upload OK

echo [3/5] npm install + prisma generate + migrate deploy...
ssh %SERVER% "cd %REMOTE_DIR% && npm install && npx prisma generate && npx prisma migrate deploy"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Deps/migrate failed!
    exit /b 1
)
echo       Deps OK

echo [4/5] Building on VPS (memory-limited, 1-2 min)...
ssh %SERVER% "systemd-run --unit=mr-build --collect --wait -p MemoryMax=1400M -p MemorySwapMax=3400M -p Nice=19 --working-directory=%REMOTE_DIR% /usr/bin/env NODE_OPTIONS=--max-old-space-size=1024 /usr/bin/npm run build"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Build failed!
    exit /b 1
)
echo       Build OK

echo [5/5] Activating + restarting PM2 + health check...
:: VPS 构建产出根布局 .next/standalone/server.js（已实测确认）；
:: 应用挂在 /rm 子路径（basePath），健康检查打 /rm/api/health
ssh %SERVER% "cd %REMOTE_DIR% && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/ && pm2 restart mindreview && sleep 5 && curl -sf -o /dev/null http://127.0.0.1:3000/rm/api/health && echo HEALTH OK || (echo HEALTH CHECK FAILED - see pm2 logs & exit 1)"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Health check failed!
    exit /b 1
)

echo.
echo ============================================
echo   Deploy OK - http://14.103.219.117/rm
echo ============================================
