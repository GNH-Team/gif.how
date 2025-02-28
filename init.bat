@echo off
REM ============================================
REM Batch Script: run_sync.bat
REM Description:
REM   1. Starts docker compose services excluding sync-service.
REM   2. Executes bun commands inside the sync-service directory.
REM   3. Shuts down the docker compose services.
REM ============================================

REM Enable delayed expansion for variable use in loops
setlocal enabledelayedexpansion

REM --- Step 1: Start docker compose services excluding sync-service ---
docker compose up -d --scale sync_service=0
if errorlevel 1 (
    echo [Error] Failed to start docker compose services.
    exit /b 1
)

REM --- Step 2: Change directory to sync-service ---
REM Adjust the path below as necessary
cd "./sync-service"
if errorlevel 1 (
    echo [Error] Failed to change directory to sync-service.
    exit /b 1
)

REM --- Step 3: Run bun commands ---
echo Running: bun install
call bun install
if errorlevel 1 (
    echo [Error] bun install failed.
    exit /b 1
)

echo Running: bun p:init
call bun p:init
if errorlevel 1 (
    echo [Error] bun p:init failed.
    exit /b 1
)

echo Running: bun p:sync
call bun p:sync
if errorlevel 1 (
    echo [Error] bun p:sync failed.
    exit /b 1
)

echo Running: bun p:copy
call bun p:copy
if errorlevel 1 (
    echo [Error] bun p:copy failed.
    exit /b 1
)

REM --- Step 4: Shut down docker compose services ---
echo Shutting down docker compose services...
docker compose down

echo Script completed successfully.
endlocal
pause
