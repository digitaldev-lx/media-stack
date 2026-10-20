# mixer: FFmpeg (mistura, ducking, loudnorm, QA). Sem modelos.
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd -r -g 10001 media && useradd -r -u 10001 -g media -m -d /home/media media
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
RUN mkdir -p /work && chown -R media:media /app /work
USER media
ENV WORK_DIR=/work
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O- http://127.0.0.1:8000/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
