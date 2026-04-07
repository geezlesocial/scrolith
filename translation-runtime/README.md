# Scrolith Translation Runtime

Self-hosted content translation runtime for Scrolith.

## Endpoints

- `GET /health`
- `GET /languages`
- `POST /detect`
- `POST /translate`

## Environment

- `TRANSLATION_RUNTIME_MODE=m2m100|mock`
- `TRANSLATION_MODEL_NAME=facebook/m2m100_418M`
- `TRANSLATION_ENGINE_KEY=m2m100_418m`
- `TRANSLATION_DETECTOR_KEY=fasttext_lid_176`
- `TRANSLATION_PRELOAD_MODELS=true|false`
- `TRANSLATION_MODEL_CACHE_DIR=/models/huggingface`
- `TRANSLATION_FASTTEXT_MODEL_PATH=/models/fasttext/lid.176.bin`
- `TRANSLATION_FASTTEXT_MODEL_URL=https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin`
- `TRANSLATION_AUTO_DOWNLOAD_FASTTEXT=true|false`
- `TRANSLATION_MAX_CHARS=5000`
- `TRANSLATION_BEAM_SIZE=4`
- `TRANSLATION_NUM_THREADS=2`
- `TRANSLATION_MAX_NEW_TOKENS=512`
- `TRANSLATION_RUNTIME_API_KEY=shared-bearer-token`

## Local Run

```bash
docker build -t scrolith-translation-runtime .
docker run --rm -p 8000:8000 -e TRANSLATION_RUNTIME_MODE=mock -e TRANSLATION_RUNTIME_API_KEY=local-dev-key scrolith-translation-runtime
```
