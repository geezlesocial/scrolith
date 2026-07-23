# Messaging Candidate CORS Fix

Date: 2026-07-23

## Change

Created a new backend candidate revision with the existing `CORS_ALLOWED_ORIGINS` mechanism:

- Revision: `scrolith-backend-00262-dif`
- Traffic: 0%
- Exact added origin: `https://messaging-322ab66d---scrolith-frontend-25ysnpjdda-as.a.run.app`

Created a replacement frontend candidate that targets the backend candidate:

- Revision: `scrolith-frontend-00312-net`
- Traffic: 0%
- Image digest: `sha256:2817374c69917ee9f877899078dbd4be2489e935ff4e886925843fcbc4b7d9d2`
- Cloud Build: `83b6fe9f-8d26-4170-bc4a-bfbef9bca533`

## Verification

- Candidate preflight: PASS
- Production-origin preflight: PASS
- Unknown-origin rejection: PASS
- Wildcard CORS: NOT ENABLED
- Production traffic: UNCHANGED

## Tests

- Backend CORS Jest suite: PASS
- Backend auth and messaging Jest suite: PASS
- Backend TypeScript build: PASS
- Backend production TypeScript build: PASS
- Frontend Cloud Build: PASS
- Frontend local build with candidate API base: PASS
- Frontend direct message-link assertions: PASS
- Checked-in Vitest message-link spec: NOT RUN, `vitest` is not installed in this workspace.

