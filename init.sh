#!/bin/bash
# ============================================
# Shell Script: init.sh
# Description:
# 1. Starts MariaDB and imports SQL dump
# 2. Starts remaining services (excluding sync-service)
# 3. Executes bun commands inside the sync-service directory
# 4. Shuts down docker compose services when complete
# ============================================

set -e  # Exit immediately if a command exits with a non-zero status

# set up alias for docker compose in case it's not available
alias "docker compose"="docker-compose"

echo "[INFO] Starting MariaDB container..."
docker compose up mariadb -d
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to start MariaDB container."
    exit 1
fi

echo "[INFO] Waiting for MariaDB to initialize (~5 seconds, hopefully)..."
sleep 5

echo "[INFO] Changing directory to sync-service..."
cd "./sync-service"

echo "[INFO] Running bun commands..."
echo "[INFO] Running: bun install"

bun install
if [ $? -ne 0 ]; then
    echo "[ERROR] bun install failed."
    echo "[INFO] Shutting down containers..."
    cd ..
    docker compose down
    exit 1
fi

# Check if /prisma directory exists before running bun p:init
if [ -d "prisma" ]; then
    echo "[INFO] Prisma directory already exists, skipping bun p:init..."
else
    echo "[INFO] Running: bun p:init"
    bun p:init
    if [ $? -ne 0 ]; then
        echo "[ERROR] bun p:init failed."
        echo "[INFO] Shutting down containers..."
        cd ..
        docker compose down
        exit 1
    fi
fi

echo "[INFO] Running: bun p:sync"
bun p:sync

echo "[INFO] Running: bun p:copy"
bun p:copy

cd ..

echo "[INFO] Build sync-service image..."
docker compose build
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to build sync-service image."
    echo "[INFO] Shutting down containers..."
    docker compose down
    exit 1
fi

echo "[INFO] Shutting down containers..."
docker compose down

echo "[INFO] Init process completed successfully."