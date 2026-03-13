# Stage 1: Build the React client
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
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
ENV PORT=3001

EXPOSE 3001

# Start the server
CMD ["node", "server/src/index.js"]
