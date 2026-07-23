# Messaging Production Rollback

Date: 2026-07-23

Rollback status: NOT EXERCISED

No new production revision was deployed, so no rollback action was required.

When deployment is unblocked, rollback should use the existing Cloud Run traffic method:

1. Identify the previous stable backend revision.
2. Shift `scrolith-backend` traffic back to the stable revision with `gcloud run services update-traffic`.
3. Confirm service readiness and 5xx rate.
4. Preserve logs and build IDs for incident review.
