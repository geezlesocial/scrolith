# Scrolitha Hotfix Monitoring

Monitor backend and frontend Cloud Run revisions for 30-60 minutes after promotion. Required signals are 5xx, P2024, Copilot 4xx/5xx, `/api/apps/track` validation failures, Ollama latency and availability, authentication failures, request latency, CPU, memory, database health, and restart activity.

Rollback immediately if authenticated Copilot success is not stable, Ollama is unavailable, tracking errors flood logs, messaging fails, or database/service health degrades.
