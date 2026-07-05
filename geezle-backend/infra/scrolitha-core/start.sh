#!/bin/sh
set -eu

MODEL="${SCROLITHA_OLLAMA_MODEL:-qwen3:14b}"
READY_RETRIES="${SCROLITHA_READY_RETRIES:-120}"
READY_SLEEP_SECONDS="${SCROLITHA_READY_SLEEP_SECONDS:-1}"

export OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0:8080}"

ollama serve &
OLLAMA_PID=$!

cleanup() {
  kill "${OLLAMA_PID}" >/dev/null 2>&1 || true
  wait "${OLLAMA_PID}" >/dev/null 2>&1 || true
}

trap cleanup INT TERM EXIT

attempt=0
until ollama list >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge "${READY_RETRIES}" ]; then
    echo "Scrolitha Core runtime failed to become ready."
    exit 1
  fi
  sleep "${READY_SLEEP_SECONDS}"
done

if ! ollama show "${MODEL}" >/dev/null 2>&1; then
  echo "Pulling Scrolitha Core model: ${MODEL}"
  ollama pull "${MODEL}"
else
  echo "Scrolitha Core model already cached: ${MODEL}"
fi

echo "Scrolitha Core runtime is ready with model ${MODEL}"
wait "${OLLAMA_PID}"
