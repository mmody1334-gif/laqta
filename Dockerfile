FROM node:22-bookworm-slim

WORKDIR /app

ENV PORT=7860
ENV HOST=0.0.0.0

# Install native build tools for sqlite and essential runtime tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package definitions
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Install Playwright Chromium and required browser libraries
RUN npx playwright install --with-deps chromium

# Build frontend React dashboard
RUN npm run build:web

EXPOSE 7860

# Start server
CMD ["npx", "tsx", "src/server/api.ts"]
