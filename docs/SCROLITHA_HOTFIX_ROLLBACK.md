# Scrolitha Hotfix Rollback

Rollback is traffic-only. Restore the previous known-good revisions with Cloud Run `update-traffic`; do not rebuild or alter schema. Before hotfix promotion, the rollback targets are backend `scrolith-backend-00235-mib` and frontend `scrolith-frontend-00299-zah`.

The hotfix is not certified for promotion until an approved authenticated request proves the Ollama disclosure and the tracking event returns 2xx.
