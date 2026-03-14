FROM node:22-alpine
WORKDIR /app

# Copy everything
COPY client/ ./client/
COPY server/ ./server/

# Install and build client
RUN cd client && npm install && npm run build

# Install server deps (production only)
RUN cd server && npm install --omit=dev

# Remove client source/node_modules (only need dist)
RUN rm -rf client/src client/node_modules client/package.json client/package-lock.json

# Environment
ENV NODE_ENV=production

# Run migrations then start server
CMD ["sh", "-c", "node server/migrations/run.js || echo 'Migration warning - continuing...'; node server/src/index.js"]
