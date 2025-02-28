# Init - Chạy lần đầu

TODO: viết script init.sh tự động hoá phần này

1. comment out sync-service trong docker compose
2. docker compose up -d
3. cd /sync-service
4. bun install
5. bun p:init
6. bun p:sync
7. docker compose down
8. uncomment sync-service trong docker compose

# Production

1. bun p:sync
2. bun p:copy
3. docker compose up -d --build

# Development

1. Tạo .env giống như .env.example
2. bun sync
3. bun dev
