# ObVault — runs anywhere Node 20+ runs. Storage (JSON store + uploads) is
# kept under STORAGE_DIR so hosts can mount one persistent volume there.
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=3000 STORAGE_DIR=/storage

# install only what the server needs
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p /storage/data /storage/uploads && chown -R node:node /storage

# app code
COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY seed-media ./seed-media
COPY README.md ./

USER node
EXPOSE 3000
VOLUME /storage
CMD ["node", "server.js"]
