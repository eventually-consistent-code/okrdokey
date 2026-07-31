##################################################################
# OKRdokey — two-stage build. Stage one installs production deps #
# only; stage two ships the workspace source on a slim runtime.  #
# One container, one volume. Boring on purpose.                  #
##################################################################

# --- deps stage ---
FROM node:22-trixie-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
# better-sqlite3 ships prebuilt binaries inside the package — no scripts needed
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# --- runtime stage ---
FROM node:22-trixie-slim

ENV NODE_ENV=production \
    DB_PATH=/data/okrdokey.sqlite \
    PORT=3000

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY packages ./packages

VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "packages/api/src/main.ts"]
