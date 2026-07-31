##################################################################
# OKRdokey — three-stage build. Web assets built once, production #
# deps installed once, slim runtime ships source + dist + deps.   #
# One container, one process, one volume. Boring on purpose.      #
##################################################################

# --- web build stage ---
FROM node:22-trixie-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN npm ci --ignore-scripts

COPY tsconfig.base.json vitest.config.ts ./
COPY packages ./packages
RUN npm run build --workspace packages/web

# --- production deps stage ---
FROM node:22-trixie-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
# api + shared only — the web app ships as a built dist, its runtime deps
# (react, tanstack, radix…) have no business in the container (~35MB)
# better-sqlite3 ships prebuilt binaries inside the package — no scripts needed
RUN npm ci --omit=dev --ignore-scripts -w packages/api -w packages/shared && npm cache clean --force

# --- runtime stage ---
FROM node:22-trixie-slim

ENV NODE_ENV=production \
    DB_PATH=/data/okrdokey.sqlite \
    PORT=3000

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
COPY packages/web/package.json ./packages/web/package.json
COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
