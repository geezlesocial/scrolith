# Cloud Run Backend Remediation

## Change

`geezle-backend/Dockerfile.storyfix.runtime` now builds the production TypeScript output during image build and starts the compiled server directly at runtime.

Previous runtime startup:

```sh
npm run migrate:apply && node -r ts-node/register/transpile-only src/server.ts
```

New runtime startup:

```sh
node dist/server.js
```

## Reason

Cloud Run request-serving instances must not perform Prisma migration deployment or Prisma client generation while scaling out. That work delays readiness and can exhaust available instances during traffic shifts.

## Release Responsibility

Production migrations remain a release-pipeline responsibility and must complete before traffic is moved to a candidate revision.

## Validation

- Local backend production build: PASS
- Cloud Build full regression: PASS, build `da708ea4-7c40-4ba0-bcd9-e685450c4fc9`
- Backend image build: PASS, build `4721942c-a111-4277-a3be-af82a1bc9321`
- Candidate deploy at 0%: PASS, revision `scrolith-backend-00268-ruz`
- Candidate read-only load test: PASS
- Candidate logs contained no runtime Prisma migration/generate startup command.

## Safety

No application route, auth, payment, GCoin, messaging, Prisma schema, ranking, Scrolitha provider, IAM, or Cloud Run traffic changes were made by this remediation.

