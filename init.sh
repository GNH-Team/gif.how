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
docker() {
    if [ "$1" = "compose" ]; then
        shift
        docker-compose "$@"
    else
        command docker "$@"
    fi
}

echo "[INFO] Starting MariaDB container..."
docker compose up -d mariadb
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
    bun prisma init --datasource-provider=mysql --url=$(grep '^DATABASE_URL=' .env | cut -d '=' -f2- | sed 's/@mariadb/@localhost/')

    if [ $? -ne 0 ]; then
        echo "[ERROR] bun p:init failed."
        echo "[INFO] Shutting down containers..."
        cd ..
        docker compose down
        exit 1
    fi



    # Set the schema file name (adjust path if needed)
    schema_file_name="prisma/schema.prisma"

    # Check if binaryTargets is already present in the prisma schema.
    if ! grep -q "binaryTargets" "$schema_file_name"; then
       # Insert binaryTargets only in the generator client block, with a tab for indentation
        sed -i '/^generator client {/,/^}/ {/provider =/a\
            binaryTargets =["native","debian-openssl-1.1.x"] }' "$schema_file_name"
        if [ $? -ne 0 ]; then
            echo "[ERROR] Failed to update binaryTargets in schema file."
            echo "[INFO] Shutting down containers..."
            exit 1
        fi
            else
        echo "[INFO] binaryTargets already present in the schema, skipping insertion."
    fi
fi

echo "[INFO] Running: bun p:sync"
cp ../.env .env.production
bun p:sync

cd ..

echo "[INFO] Build sync-service image..."
docker compose build
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to build sync-service image."
    echo "[INFO] Shutting down containers..."
    docker compose down
    exit 1
fi

echo "[INFO] Everything completed successfully."

# Prompt the user to start containers
read -p "[INFO] Would you like to start containers? (y/n): " user_choice
if [[ "$user_choice" == "y" || "$user_choice" == "Y" ]]; then
    echo "[INFO] Starting containers..."
    docker compose up -d
else
    echo "[INFO] Shutting down containers..."
    docker compose down
fi

echo "[INFO] Process completed successfully."