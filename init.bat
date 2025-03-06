@echo off
REM ============================================
REM Batch Script: init.bat
REM Description:
REM 1. Starts MariaDB and imports SQL dump
REM 2. Starts remaining services (excluding sync-service)
REM 3. Executes bun commands inside the sync-service directory
REM 4. Shuts down docker compose services when complete
REM ============================================
setlocal enabledelayedexpansion

REM Load environment variables from .env file
for /f "usebackq tokens=1,* delims==" %%G IN (".env") do (
    set "line=%%G"
    if not "!line:~0,1!"=="#" (
        set "%%G=%%H"
    )
)

echo [INFO] Starting MariaDB container...
docker compose up mariadb -d

if errorlevel 1 (
    echo [ERROR] Failed to start MariaDB container.
    exit /b 1
)

echo [INFO] Waiting for MariaDB to initialize (5 seconds)...
timeout /t 5 /nobreak

echo [INFO] Changing directory to sync-service...
cd "./sync-service"

echo [INFO] Running bun commands...
echo [INFO] Running: bun install
call bun install

if errorlevel 1 (
    echo [ERROR] bun install failed.
    echo [INFO] Shutting down containers...
    cd ..
    docker compose down
    exit /b 1
)

REM Check if /prisma directory exists before running bun p:init
if exist "prisma" (
    echo [INFO] Prisma directory already exists, skipping bun p:init...
) else (
    echo [INFO] Running: bun p:init
    call bun p:init
    
    if errorlevel 1 (
        echo [ERROR] bun p:init failed.
        echo [INFO] Shutting down containers...
        cd ..
        docker compose down
        exit /b 1
    )
)

echo [INFO] Running: bun p:copy
call bun p:copy

echo [INFO] Running: bun p:sync
start /wait cmd /c "bun p:sync"
cd ..

echo [INFO] Build sync-service image...
docker compose build

if errorlevel 1 (
    echo [ERROR] Failed to build sync-service image.
    echo [INFO] Shutting down containers...
    docker compose down
    exit /b 1
)

docker compose down

endlocal
pause