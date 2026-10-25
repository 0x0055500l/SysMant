FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node backend/src ./src
USER node
EXPOSE 3100
CMD ["node", "src/server.js"]
