# Servico one-shot para descarregar modelos para o volume /models (corre como root so aqui).
FROM python:3.12-slim-bookworm
RUN pip install --no-cache-dir huggingface_hub
COPY fetch.py /fetch.py
ENV MODELS_DIR=/models
ENTRYPOINT ["python", "/fetch.py"]
