@echo off
chcp 65001 >nul
title CRM Antyramy Deploy

set SSH_USER=Pluszek
set SSH_HOST=s61.mydevil.net
set SSH_KEY=%USERPROFILE%\.ssh\id_rsa_pluszek
set REMOTE_ROOT=/usr/home/Pluszek/domains/crm.antyramy.eu/public_nodejs
set LOCAL_ROOT=C:\Claude\APP\CRM_ANTYRAMY

echo.
echo  =========================================
echo   CRM Antyramy - Deploy na crm.antyramy.eu
echo  =========================================
echo.

echo [1/5] Budowanie frontendu...
cd /d %LOCAL_ROOT%\frontend
set VITE_API_URL=https://crm.antyramy.eu
call npm run build
if errorlevel 1 (
    echo BLAD: npm run build - frontend - nie powiodl sie!
    pause
    exit /b 1
)
echo  OK
echo.

echo [2/5] Budowanie backendu...
cd /d %LOCAL_ROOT%\backend
call npm run build
if errorlevel 1 (
    echo BLAD: npm run build - backend - nie powiodl sie!
    pause
    exit /b 1
)
echo  OK
echo.

echo [3/5] Upload backendu na serwer...
ssh -i "%SSH_KEY%" %SSH_USER%@%SSH_HOST% "chmod -R u+w %REMOTE_ROOT%/dist_new 2>/dev/null; rm -rf %REMOTE_ROOT%/dist_new; mkdir -p %REMOTE_ROOT%/dist_new"
scp -q -r -i "%SSH_KEY%" "%LOCAL_ROOT%\backend\dist\." %SSH_USER%@%SSH_HOST%:%REMOTE_ROOT%/dist_new
if errorlevel 1 ( echo BLAD: SCP dist! & pause & exit /b 1 )
scp -q -i "%SSH_KEY%" "%LOCAL_ROOT%\backend\package.json" %SSH_USER%@%SSH_HOST%:%REMOTE_ROOT%/package.json
if errorlevel 1 ( echo BLAD: SCP package.json! & pause & exit /b 1 )
if exist "%LOCAL_ROOT%\backend\logo.png" (
    scp -q -i "%SSH_KEY%" "%LOCAL_ROOT%\backend\logo.png" %SSH_USER%@%SSH_HOST%:%REMOTE_ROOT%/logo.png
)
echo  OK
echo.

echo [4/5] Upload frontendu na serwer...
ssh -i "%SSH_KEY%" %SSH_USER%@%SSH_HOST% "chmod -R u+w %REMOTE_ROOT%/public_new 2>/dev/null; rm -rf %REMOTE_ROOT%/public_new; mkdir -p %REMOTE_ROOT%/public_new"
scp -q -r -i "%SSH_KEY%" "%LOCAL_ROOT%\frontend\dist\." %SSH_USER%@%SSH_HOST%:%REMOTE_ROOT%/public_new
if errorlevel 1 (
    echo BLAD: SCP frontend dist! & pause & exit /b 1
)
echo  OK
echo.

echo [5/5] Podmiana plikow, npm install, restart Passengera...
ssh -i "%SSH_KEY%" %SSH_USER%@%SSH_HOST% "cd %REMOTE_ROOT% && chmod -R u+w dist 2>/dev/null; rm -rf dist && mv dist_new dist && mkdir -p public && cp -rf public_new/* public/ && chmod -R u+w public_new && rm -rf public_new && npm20 install --production --silent && touch tmp/restart.txt"
if errorlevel 1 (
    echo BLAD: SSH finalizacja nie powiodla sie!
    pause
    exit /b 1
)
echo  OK
echo.

echo  =========================================
echo   Deploy zakonczony! crm.antyramy.eu
echo  =========================================
echo.
pause
