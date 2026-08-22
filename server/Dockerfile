FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libatspi2.0-0 \
  libgtk-3-0 \
  libx11-xcb1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

RUN npx playwright install chromium --with-deps

COPY dist ./dist

ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright

EXPOSE 3000

CMD ["node", "dist/index.js"]