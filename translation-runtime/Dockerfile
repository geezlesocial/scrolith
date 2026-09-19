# Python 3.11.13 slim Bookworm; amd64 immutable base digest.
FROM python:3.11.13-slim-bookworm@sha256:cec9aa7aa96eea4fa036e9b82be1e6b325f2e3707f462d885868df51ec0a4b47

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    TRANSLATION_RUNTIME_MODE=mock \
    TRANSLATION_PRELOAD_MODELS=false \
    TRANSLATION_MODEL_CACHE_DIR=/models/huggingface \
    TRANSLATION_FASTTEXT_MODEL_PATH=/models/fasttext/lid.176.bin \
    TRANSLATION_MODEL_REPO=jncraton/m2m100_418M-ct2-int8 \
    TRANSLATION_COMPUTE_TYPE=int8

ARG INSTALL_MODEL_DEPS=true

COPY requirements.base.txt ./requirements.base.txt
COPY requirements.model.txt ./requirements.model.txt
COPY app.py ./app.py

RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.base.txt \
    && if [ "$INSTALL_MODEL_DEPS" = "true" ]; then \
        python -m pip install --no-cache-dir -r requirements.model.txt; \
      fi

RUN groupadd --system appgroup \
    && useradd --system --gid appgroup --create-home appuser \
    && mkdir -p /models/huggingface /models/fasttext \
    && chown -R appuser:appgroup /app /models

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
