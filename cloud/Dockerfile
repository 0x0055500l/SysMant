FROM node:24-bookworm-slim AS portal-build
WORKDIR /build
COPY --chmod=0644 frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --chmod=0644 backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node backend/src ./src
COPY --chown=node:node backend/scripts ./scripts
COPY --from=portal-build --chown=node:node /build/dist/sysmant-supervision/browser ./public
USER node
RUN node -e "require('./src/app'); require('./src/services/supervision-auth.service');"
EXPOSE 3100
CMD ["node", "src/server.js"]
