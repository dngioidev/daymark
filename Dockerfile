# Daymark self-hosted server: sync API + the web app (PWA), one container.
# Build:  docker build -t daymark .
# Run:    docker run -d -p 3000:3000 -e DAYMARK_PASSWORD='choose-a-strong-one' -v "$PWD/data:/data" daymark

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/server.ts ./
COPY --from=build /app/src/sync ./src/sync
COPY --from=build /app/src/types ./src/types
COPY --from=build /app/src/utils ./src/utils
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node_modules/.bin/tsx", "server.ts", "--production"]
