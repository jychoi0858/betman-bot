FROM node:20-slim

# Playwright 브라우저 설치에 필요한 의존성
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install
RUN npx playwright install chromium

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
