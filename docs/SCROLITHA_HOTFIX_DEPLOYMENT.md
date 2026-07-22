# Scrolitha Hotfix Deployment

Hotfix tag: `p333-scrolitha-hotfix1`.

Deployment must build immutable backend and frontend images, deploy both at zero traffic, run tagged smoke tests, and only then promote through `5% -> 25% -> 50% -> 100%`. No schema migration is required for this hotfix. The existing `scrolith-backend-00235-mib` and `scrolith-frontend-00299-zah` revisions remain the rollback points until certification is complete.

Current status: implementation/build verification in progress; authenticated production certification is not yet complete.
