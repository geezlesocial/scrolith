# Messaging Candidate CORS Audit

Date: 2026-07-23

## Scope

Release candidate frontend:

- `https://messaging-322ab66d---scrolith-frontend-25ysnpjdda-as.a.run.app`

Release candidate backend:

- `https://messaging-e5fa6599---scrolith-backend-25ysnpjdda-as.a.run.app`

Production API:

- `https://api.scrolith.com`

## Findings

- CORS is enforced by Express `cors` middleware in `geezle-backend/src/server.ts`.
- The running CORS policy uses an exact allowlist from `FRONTEND_URL`, `PUBLIC_APP_URL`, `CORS_ALLOWED_ORIGINS`, and fixed production/mobile/local origins.
- Credentials are enabled.
- No wildcard origin is used.
- Cloud Run exposes a `CORS_ALLOWED_ORIGINS` environment variable on the backend service template.
- The candidate origin was rejected because it was not present in the base allowlist and `CORS_ALLOWED_ORIGINS` had no candidate value available to the active candidate.
- The original frontend candidate was built with `VITE_API_URL=https://api.scrolith.com/api`, so candidate browser requests were sent from the tagged frontend origin to the production API domain.

## Safe Resolution

- Created backend candidate revision `scrolith-backend-00262-dif` at 0% traffic.
- Added only the exact candidate frontend origin through `CORS_ALLOWED_ORIGINS`.
- Rebuilt the frontend candidate as `scrolith-frontend-00312-net` at 0% traffic with the tagged backend candidate API base.
- Production traffic remained unchanged.

## Security Outcome

- `Access-Control-Allow-Origin: *` was not enabled.
- Arbitrary `*.a.run.app` origins were not enabled.
- Random origin `https://evil-example.invalid` did not receive an allow-origin header.
- Production origin `https://scrolith.com` remained allowed.

