FROM node:20-bookworm-slim

# Real Google Chrome + xvfb (headed Chrome on a virtual display passes Cloudflare;
# headless browsers get detected and blocked)
RUN apt-get update && apt-get install -y \
  wget gnupg xvfb xauth ca-certificates procps ffmpeg \
  && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y google-chrome-stable fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV PORT=10000
ENV HEADLESS=false
ENV CHROME_CHANNEL=chrome
ENV USER_DATA_DIR=/tmp/aurora-profile
ENV DOWNLOAD_DIR=/tmp/aurora-downloads
ENV NODE_OPTIONS=--max-old-space-size=192

EXPOSE 10000

CMD ["sh", "-c", "echo '[entrypoint] starting xvfb-run node...'; xvfb-run -a --server-args='-screen 0 1366x768x24' node dist/index.js; code=$?; echo \"[entrypoint] process exited with code $code\"; exit $code"]
