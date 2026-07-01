FROM ollama/ollama:latest

ENV OLLAMA_HOST=0.0.0.0:8080

COPY infra/scrolitha-core/start.sh /usr/local/bin/scrolitha-core-start

RUN chmod +x /usr/local/bin/scrolitha-core-start

EXPOSE 8080

ENTRYPOINT ["/bin/sh", "/usr/local/bin/scrolitha-core-start"]
