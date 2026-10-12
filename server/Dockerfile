FROM node:20-alpine

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Expose backend port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "server.js"]
