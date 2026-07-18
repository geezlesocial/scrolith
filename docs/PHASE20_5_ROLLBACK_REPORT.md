# Phase 20.5 — Rollback Report

## Web frontend

```bash
# Stable pre-20.5 recovery (if needed)
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00143-leb=100
# Or older
gcloud run services update-traffic scrolith-frontend --region asia-southeast1 \
  --to-revisions scrolith-frontend-00138-ruh=100
```

**Never** promote `scrolith-frontend-00140-zaq` (p204).

## Android

- Do not halt rollout of unpublished AAB (no store publish yet).  
- If Play staged rollout misbehaves: halt rollout in Play Console.  
- Prior artifacts: `release-artifacts/android-1.1.18`.

## Desktop

- Revert website CMS/app distribution URLs to previous download links.  
- Retain `Scrolith-Desktop-*-1.1.14-x64.exe` as fallback binaries.
