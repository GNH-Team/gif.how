# Use the official Bun image.
FROM oven/bun:latest

# Set working directory.
WORKDIR /app

# Copy dependency manifests.
COPY package.json bun.lock .env ./


# Copy prisma folder
COPY prisma prisma

# Install dependencies with Bun.
RUN bun install

RUN bun sync

# Copy the rest of your application code.
COPY . .

# Expose a port if your microservice listens (optional).
EXPOSE 3000

# Run your microservice. Bun will compile and run TypeScript on the fly.
CMD ["bun", "dev"]
