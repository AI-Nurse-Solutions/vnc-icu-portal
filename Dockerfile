# Stage 1: Build the React client
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
# Cache bust: ensure client source changes always trigger a rebuild
ARG CACHEBUST=1
COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:22-alpine
WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Copy server source
COPY server/ ./server/

# Copy built client from stage 1
COPY --from=client-build /app/client/dist ./client/dist

# Environment
ENV NODE_ENV=production

# Run migrations (allow failure) then start the server
CMD ["sh", "-c", "node server/migrations/run.js || echo 'Migration warning - continuing...'; node server/src/index.js"]
