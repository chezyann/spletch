FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run check
RUN npm prune --omit=dev --workspaces --include-workspace-root

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates sqlite3 tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/scripts/backup.mjs ./scripts/backup.mjs
COPY deploy/synology/spletch-entrypoint.sh /usr/local/bin/spletch-entrypoint

RUN chmod 0755 /usr/local/bin/spletch-entrypoint \
    && mkdir -p /var/lib/spletch /var/backups/spletch \
    && chown -R node:node /var/lib/spletch /var/backups/spletch /app

USER node
EXPOSE 4000 4001
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/spletch-entrypoint"]
CMD ["node", "apps/server/dist/index.js"]
