# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=1000:1000 /app /app
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=30s \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/rooms').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
