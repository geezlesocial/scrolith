# Ollama 0.12.6; amd64 immutable runtime digest.
FROM ollama/ollama:0.12.6@sha256:352e045b937ac29d3d9550c22fb85525f60a89e064df34c26579bee5a93b3a16

ARG SCROLITHA_OLLAMA_MODEL=qwen3:8b
ENV OLLAMA_HOST=0.0.0.0:8080
ENV SCROLITHA_OLLAMA_MODEL=${SCROLITHA_OLLAMA_MODEL}
ENV OLLAMA_MODELS=/models

COPY infra/scrolitha-core/start.sh /usr/local/bin/scrolitha-core-start

RUN useradd --system --create-home --home-dir /home/ollama ollama \
  && mkdir -p /models \
  && chown -R ollama:ollama /models \
  && chmod +x /usr/local/bin/scrolitha-core-start

RUN /bin/sh -c ' \
  ollama serve >/tmp/ollama-build.log 2>&1 & \
  OLLAMA_PID=$!; \
  attempt=0; \
  until ollama list >/dev/null 2>&1; do \
    attempt=$((attempt + 1)); \
    if [ "$attempt" -ge 120 ]; then \
      cat /tmp/ollama-build.log; \
      exit 1; \
    fi; \
    sleep 1; \
  done; \
  ollama pull "${SCROLITHA_OLLAMA_MODEL}"; \
  kill "${OLLAMA_PID}" >/dev/null 2>&1 || true; \
  wait "${OLLAMA_PID}" >/dev/null 2>&1 || true \
'

RUN chown -R ollama:ollama /models

USER ollama

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["ollama", "list"]

ENTRYPOINT ["/bin/sh", "/usr/local/bin/scrolitha-core-start"]
