# Release Checklist — Frontend Staged Cert (Phase 21.1.6)

## Before gate

- [ ] Commits for the candidate revision identified
- [ ] Staged Cloud Run revision healthy (tag URL 200)
- [ ] QA credentials or storage state prepared
- [ ] `CERT_BASE_URL` points at staged revision tag or production domain with staged traffic

## Run

- [ ] `npm run test:cert:unit`
- [ ] `npm run test:cert:storage` (if needed)
- [ ] `npm run test:cert:gate` with `CERT_FEED_IDENTITY_MS=60000`
- [ ] Optional: Pixel 7 / iPhone 15 projects
- [ ] Optional: `npm run test:cert:android-prep`

## Review

- [ ] `playwright-results/phase2116/release-gate-summary.json` → `overall: PASS`
- [ ] `promoteRecommended: true` only if auth E2E ran
- [ ] Failure screenshots/traces triaged
- [ ] Performance baselines updated under `tests/certification/baselines/`
- [ ] No elevated Cloud Run ERROR for candidate revision

## Promote decision

- [ ] All automated gates pass
- [ ] Android residual signed or deferred with risk acceptance
- [ ] Explicit human approval to promote traffic
- [ ] Rollback revision documented

## After promote

- [ ] Traffic 100% on candidate
- [ ] 15-minute error watch
- [ ] Spot-check Member Home on desktop + phone
