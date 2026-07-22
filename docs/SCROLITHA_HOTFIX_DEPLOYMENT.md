# Scrolitha Hotfix Deployment

Hotfix tags: `p333-scrolitha-hotfix1` through `p333-scrolitha-hotfix4`.

Final backend revision: `scrolith-backend-p3334-ollama4` at 100%.

Final backend image: `sha256:67e1e1200fda325452abd9338d66d9a29d05186a94121969f65202e51d4fcc1b`.

Frontend revision: `scrolith-frontend-p3334-ollama` at 100%.

Backend traffic was staged `5% -> 25% -> 50% -> 100%`. The prior backend revision `scrolith-backend-p3334-ollama2` remains available for rollback. No schema migration was required.

Authenticated certification passed before final promotion. Android AAB 1.1.37 / versionCode 47 was built from frontend commit `73a5cb14` and was not uploaded to Google Play.
