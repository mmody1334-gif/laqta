FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

ENV PORT=7860
ENV HOST=0.0.0.0

# Copy package definitions
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy application source
COPY . .

# Build frontend React dashboard
RUN npm run build:web

# Expose Hugging Face Space port
EXPOSE 7860

# Start crawler and web dashboard
CMD ["npx", "tsx", "src/server/api.ts"]
