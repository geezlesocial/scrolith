# Scrolitha Hotfix Rollback

Rollback is traffic-only. No rebuild or schema change is required.

- Current backend: `scrolith-backend-p3334-ollama4` at 100%.
- Immediate backend rollback: `scrolith-backend-p3334-ollama2`.
- Frontend rollback: `scrolith-frontend-00299-zah`.

```powershell
gcloud run services update-traffic scrolith-backend --region=asia-southeast1 --to-revisions 'scrolith-backend-p3334-ollama2=100'
```

The previous production revision `scrolith-backend-00235-mib` remains retained as an additional rollback point.
