FROM oven/bun:1.3.14-alpine AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY server/package.json ./server/package.json
RUN bun install

FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY shared ./shared
COPY server ./server
RUN bun --cwd server run build

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
USER bun
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:8787/api/v1/health');process.exit(r.ok?0:1)"]
CMD ["bun", "--cwd", "server", "run", "start"]
