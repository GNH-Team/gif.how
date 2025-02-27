# Use the official Bun image.
FROM oven/bun:latest

# Set working directory.
WORKDIR /app

# Copy dependency manifests.
COPY package.json bun.lock index.ts ./

# Install dependencies with Bun.
RUN bun install

COPY .env.production ./.env

# Copy the rest of your application code.
COPY utils ./utils
COPY prisma ./prisma
# ! Mariadb might not start during this image's build time, so we need to copy the prebuild prisma schema file from outside
COPY node_modules/.prisma ./node_modules/.prisma

# Run your microservice. Bun will compile and run TypeScript on the fly.
CMD ["bun", "dev"]
