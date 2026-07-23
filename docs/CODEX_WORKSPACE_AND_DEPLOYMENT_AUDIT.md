# Codex Workspace And Deployment Audit

Date: 2026-07-23

## Workspace

- Root: `C:\Projects`
- Root branch: `release/backend-production`
- Root HEAD before this audit: `7efc531f test(infra): isolate backend test runtime`
- Backend path: `geezle-backend`
- Frontend submodule path: `geezle`
- Mobile path: `mobile`

## Production State Observed

- GCP project: `scrolith-500821`
- Cloud Run region: `asia-southeast1`
- Backend service: `scrolith-backend`
- Backend active image observed: `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-backend:p333-scrolitha-canonical3`
- Backend active traffic observed: 100% production traffic
- Frontend service: `scrolith-frontend`
- Frontend active image observed: `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p333-scrolitha-canonical1`
- Frontend active traffic observed: 100% production traffic
- Cloud SQL instance observed: `scrolith-postgres-prod`
- No separate Cloud SQL test instance was found in the project listing.

## Existing Deployment Method

Recent production documents show the established deployment path:

- Build container images with Cloud Build YAML files in `geezle-backend` and `geezle`.
- Deploy Cloud Run revisions at 0% traffic with tags.
- Promote traffic gradually with `gcloud run services update-traffic`.
- Take an on-demand Cloud SQL backup before production rollout when database work is involved.
- Monitor backend/frontend services after traffic changes.

## Safety Decision

No local Docker path was used. Because no Cloud SQL test instance was present, the backend regression path was implemented with an ephemeral PostgreSQL 16 container inside Cloud Build's build network. The guard refuses production markers and requires explicit test-only database markers before Prisma operations run.
