FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    TRANSLATION_RUNTIME_MODE=mock \
    TRANSLATION_PRELOAD_MODELS=false \
    TRANSLATION_MODEL_CACHE_DIR=/models/huggingface \
    TRANSLATION_FASTTEXT_MODEL_PATH=/models/fasttext/lid.176.bin

ARG INSTALL_MODEL_DEPS=true
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

COPY requirements.base.txt ./requirements.base.txt
COPY requirements.model.txt ./requirements.model.txt
COPY app.py ./app.py

RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.base.txt \
    && if [ "$INSTALL_MODEL_DEPS" = "true" ]; then \
        python -m pip install --no-cache-dir --index-url ${TORCH_INDEX_URL} torch==2.8.0 \
        && python -m pip install --no-cache-dir -r requirements.model.txt; \
      fi

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
