# tts-qwen: voz fixa (voice pack: ref.wav + ref.txt + params.json) com Qwen3-TTS em modo clone. CPU.
# Contexto de build = raiz do repo (o servidor e local-audio/tts_qwen.py). Pesos no volume /models (nunca na imagem);
# o voice pack e montado so de leitura em /voices (activo pessoal, nunca no repo nem na imagem).
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 sox wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd -r -g 10001 media && useradd -r -u 10001 -g media -m -d /home/media media
WORKDIR /app
COPY tts-qwen/requirements.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
COPY local-audio/tts_qwen.py .
RUN mkdir -p /work /cache && chown -R media:media /app /work /cache
USER media
ENV HOME=/home/media WORK_DIR=/work VOICE_PACKS_DIR=/voices QWEN_CACHE_DIR=/cache QWEN_DEVICE=cpu \
    QWEN_MODEL=/models/qwen/Qwen3-TTS-12Hz-0.6B-Base HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 CMD wget -q -O- http://127.0.0.1:8000/health || exit 1
CMD ["sh", "-c", "exec python tts_qwen.py --voice \"$DEFAULT_VOICE\" --serve 8000"]
