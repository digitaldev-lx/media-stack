# Worker de render HyperFrames (Apache-2.0): video + apresentacoes.
# Determinismo: fixar a base por digest em producao (ARG BASE) e rever o Chromium do Debian a cada rebuild.
ARG BASE=node:22-bookworm
FROM ${BASE}

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg chromium ca-certificates fontconfig fonts-inter fonts-liberation fonts-noto-color-emoji \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 \
    libdrm2 libexpat1 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxkbcommon0 libxrandr2 wget xdg-utils \
    && rm -rf /var/lib/apt/lists/* && fc-cache -f

RUN groupadd -r -g 10001 media && useradd -r -u 10001 -g media -m -d /home/media media
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js ./
RUN mkdir -p /work && chown -R media:media /app /work /home/media

USER media
ENV HOME=/home/media PORT=3000 WORK_DIR=/work \
    HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1 \
    HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
