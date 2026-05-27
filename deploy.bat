@echo off
chcp 65001 >nul
title CRM Antyramy Deploy

set SSH_USER=Pluszek
set SSH_HOST=s61.mydevil.net
set SSH_KEY=%USERPROFILE%\.ssh\id_rsa
set REMOTE_ROOT=/usr/home/Pluszek/domains/crm.antyramy.eu/public_nodejs
set LOCAL_ROOT=D:\DEV\APLIKACJE\app-crm-antyramy

echo.
echo  =========================================
echo   CRM Antyramy - Deploy na crm.antyramy.eu
echo  =========================================
echo.

echo [1/5] Budowanie frontendu...
cd /d %LOCAL_ROOT%\frontend
call npm run build
if errorlevel 1 (
    echo BLAD: npm run build (frontend) nie powiodl sie!
    pause
    exit /b 1
)
echo  OK
echo.

echo [2/5] Budowanie backendu...
cd /d %LOCAL_ROOT%\backend
call npm run build
if errorlevel 1 (
    echo BLAD: npm run build (backend) nie powiodl sie!
    pause
    exit /b 1
)
echo  OK
echo.

echo [3/5] Upload backendu na serwer...
scp -r -i "%SSH_KEY%" "%LOCAL_ROOT%\backend\dist" %SSH_USER%@%SSH_HOST%:%REMOTE_ROOT%/dist_new
if errorlevel 1 ( echo BLAD: SCP dist! & pause & exit /b 1 )
scp -i "%SSH_KEY%" "%LOCAL_ROOT%\backend\package.json" %SSH_USER%@%SSH_HOST%:%REMOTE_ROOT%/package.json
if errorlevel 1 ( echo BLAD: SCP package.json! & pause & exit /b 1 )
if exist "%LOCAL_ROOT%\backend\logo.png" (
    scp -i "%SSH_KEY%" "%LOCAL_ROOT%\backend\logo.png" %SSH_USER%@%SSH_HOST%:%REMOTE_ROOT%/logo.png
)
echo  OK
echo.

echo [4/5] Upload frontendu na serwer...
scp -r -i "%SSH_KEY%" "%LOCAL_ROOT%\frontend\dist" %SSH_USER%@%SSH_HOST%:%REMOTE_ROOT%/public_new
if errorlevel 1 (
    echo BLAD: SCP frontend dist! & pause & exit /b 1
)
echo  OK
echo.

echo [5/5] Podmiana plikow, npm install, restart Passengera...
ssh -i "%SSH_KEY%" %SSH_USER%@%SSH_HOST% "cd %REMOTE_ROOT% && rm -rf dist && mv dist_new dist && mkdir -p public && cp -rf public_new/* public/ && rm -rf public_new && npm install --production --silent && touch tmp/restart.txt"
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
