# Messaging Production Deployment

Date: 2026-07-23

Deployment status: NOT STARTED

Reason: The DB-backed Cloud Build regression matrix failed at the full Jest gate.

No production candidate image was built for this phase. No Cloud Run revision was created. No production traffic was changed.

Required unblock:

1. Repair or explicitly scope the failing backend tests.
2. Re-run the Cloud Build regression matrix successfully against the ephemeral PostgreSQL database.
3. Only after the matrix passes, take the approved production backup and proceed with the existing Cloud Build plus Cloud Run 0% revision deployment method.
