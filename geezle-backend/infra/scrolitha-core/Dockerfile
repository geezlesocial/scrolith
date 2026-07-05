FROM ollama/ollama:latest

ARG SCROLITHA_OLLAMA_MODEL=qwen3:4b
ENV OLLAMA_HOST=0.0.0.0:8080
ENV SCROLITHA_OLLAMA_MODEL=${SCROLITHA_OLLAMA_MODEL}

COPY infra/scrolitha-core/start.sh /usr/local/bin/scrolitha-core-start

RUN chmod +x /usr/local/bin/scrolitha-core-start

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

EXPOSE 8080

ENTRYPOINT ["/bin/sh", "/usr/local/bin/scrolitha-core-start"]
