# Rollback Checklist — Frontend Cloud Run

## When to rollback

- Feed identity regressions in production
- Severe layout breakage / horizontal overflow on post cards
- Elevated JS error rate or blank shell
- Accessibility-breaking contrast failure on primary surfaces

## Primary action (traffic only — do not delete revision)

```powershell
# Return 100% to previous production (example: p2114i)
gcloud run services update-traffic scrolith-frontend `
  --project=scrolith-500821 `
  --region=asia-southeast1 `
  "--to-revisions=scrolith-frontend-00131-4jr=100"
```

Replace revision name with the documented rollback for the release.

## Verify

- [ ] `gcloud run services describe scrolith-frontend --region=asia-southeast1` shows 100% on rollback
- [ ] https://scrolith.com loads
- [ ] Member Home posts render
- [ ] Error rate returns to baseline

## Do not

- Delete the failed revision until post-mortem complete
- Revert git commits as the first response (traffic rollback is faster)
- Bundle unrelated fixes into emergency rollback

## After stabilization

1. Open narrowly scoped `Phase 21.1.xR` if code fix required  
2. Re-run `npm run test:cert:gate`  
3. Re-stage traffic 10–20% before 100%
