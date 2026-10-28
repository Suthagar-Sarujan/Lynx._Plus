# Web app image — runs `next start`. Build with:
#   docker build -t lynx-plus-web .
FROM node:20-bookworm-slim AS base

# @napi-rs/canvas ships prebuilt native binaries — no build toolchain needed,
# just OpenSSL for Prisma's query engine.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
