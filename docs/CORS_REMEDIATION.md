# Backend Candidate CORS Remediation

## Scope

This remediation created a new backend candidate revision to correct the CORS allowlist drift that blocked staged production rollout.

No production traffic was promoted.

## Candidate

- Previous backend candidate: `scrolith-backend-00268-ruz`
- Corrected backend candidate: `scrolith-backend-00269-xer`
- Corrected candidate tag: `cors-prod-02d8547b`
- Corrected candidate traffic: `0%`
- Image digest preserved: `sha256:6155490fbb6b467179f651ea8c13d6697937fcfa8f301e59453b938987705896`

## CORS Configuration

Allowed origins on the corrected candidate:

- `https://scrolith.com`
- `https://www.scrolith.com`
- `https://messaging-322ab66d---scrolith-frontend-25ysnpjdda-as.a.run.app`

Wildcard origins were not enabled.

## Preserved Configuration

The corrected candidate preserved:

- Startup remediation image
- Cloud SQL attachment
- Service account
- Sidecar configuration
- Concurrency
- Timeout
- Max scale
- Scrolitha provider/model configuration
- Secret references

## Validation

Passed:

- Local backend production TypeScript build
- Cloud Build production build
- Cloud Build node tests
- Cloud Build full Jest regression
- CORS preflight for production origins
- CORS preflight for candidate frontend origin
- Negative arbitrary-origin CORS check
- Backend health/read-only public checks

Blocked:

- Candidate readiness, because Prisma connection pool timeout logs were observed during candidate validation.

## Decision

The CORS drift is corrected, but `scrolith-backend-00269-xer` is not certified for production rollout because a stop condition occurred.

