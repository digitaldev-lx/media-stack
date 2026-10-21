# media-gateway: POST /v1/jobs -> 202, estado persistente (/state), HMAC, pipeline video/apresentacao, callback assinado.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg wget ca-certificates && rm -rf /var/lib/apt/lists/*
RUN groupadd -r -g 10001 media && useradd -r -u 10001 -g media -m -d /home/media media
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js ./
COPY lib ./lib
COPY three ./three
RUN mkdir -p /work /state /library && chown -R media:media /app /work /state
USER media
ENV WORK_DIR=/work STATE_DIR=/state LIBRARY_DIR=/library
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -q -O- http://127.0.0.1:8080/health || exit 1
CMD ["node", "server.js"]
