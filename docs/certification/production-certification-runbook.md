# Production Certification Runbook — Phase 21.1.6

## Scope

Automated certification for staged frontend revisions (currently `scrolith-frontend-00198-jak` / tag `p2115`).

**Does not** change Cloud Run traffic. Promotion remains a separate, explicit step.

## Quick path

```powershell
cd C:\Projects\geezle

# 1) Auth session
$env:CERT_EMAIL="..."
$env:CERT_PASSWORD="..."
$env:CERT_BASE_URL="https://p2115---scrolith-frontend-25ysnpjdda-as.a.run.app"
npm run test:cert:storage

# 2) Full identity window (60s)
$env:CERT_FEED_IDENTITY_MS="60000"

# 3) Gate
npm run test:cert:gate
```

Inspect:

- `playwright-results/phase2116/release-gate-summary.json`
- `playwright-results/phase2116/html-report/`
- `tests/certification/baselines/*-latest.json`

## Pass criteria

| Gate | Pass |
|------|------|
| Unit contracts (spacing, post card, feed stability) | All green |
| Authenticated E2E (desktop + mobile-390) | All green or intentional skip with inventory |
| Feed identity 60s | No post id / fingerprint change |
| A11y | Focus, labels, touch heights, reduced motion |
| Perf | CLS under budget; baseline written |

## Promote only when

1. `release-gate-summary.json` → `promoteRecommended: true`
2. Android wrapper checklist signed (manual or ADB prep)
3. Operator spot-check of dark mode on live cards

Then:

```powershell
gcloud run services update-traffic scrolith-frontend `
  --project=scrolith-500821 --region=asia-southeast1 `
  "--to-revisions=scrolith-frontend-00198-jak=100"
```

## Hold when

- Gate exit code 1 or 2
- Any feed identity failure
- Auth unavailable and full cert required

## Artifacts

| Path | Content |
|------|---------|
| `playwright-results/phase2116/cert-results.json` | Playwright JSON |
| `playwright-results/phase2116/release-gate-summary.json` | Gate decision |
| `playwright-results/phase2116/test-output/` | Failure screenshots/traces |
| `tests/certification/baselines/` | CLS/FCP/LCP samples |

## Related docs

- [Authenticated QA setup](./authenticated-qa-setup.md)
- [Device checklist](./device-checklist.md)
- [Release checklist](./release-checklist.md)
- [Rollback checklist](./rollback-checklist.md)
- [Android wrapper cert](./android-wrapper-cert.md)
