# tts-local: Piper (pt_PT, GPL-3.0 codigo) + Kokoro-onnx (EN/PT-BR). CPU. Modelos em volume /models (nao na imagem).
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng libsndfile1 wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd -r -g 10001 media && useradd -r -u 10001 -g media -m -d /home/media media
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
RUN mkdir -p /work && chown -R media:media /app /work
USER media
ENV WORK_DIR=/work MODELS_DIR=/models HOME=/home/media
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -q -O- http://127.0.0.1:8000/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
