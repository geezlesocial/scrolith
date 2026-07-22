# Messaging Group Member Monitoring

Date: 2026-07-23

## Status

Production monitoring has not started because deployment was not performed.

## Required Signals For Rollout

- Backend 4xx and 5xx rates.
- Member resolver latency and failure rate.
- Member add failures and duplicate-member conflicts.
- Message URL renderer frontend exceptions.
- Internal navigation failures.
- External link opening failures.
- Capacitor Browser errors after Android rebuild.
- Authentication failures.
- Scrolitha messaging regressions.
- Cloud Run CPU, memory, instance health, and database connection pressure.

## Rollback Triggers

- Unsafe URL schemes activate.
- Internal Scrolith URLs break SPA navigation.
- External links replace the main app shell.
- Group authorization is bypassed.
- Partial email enumeration becomes possible.
- Duplicate active memberships are created.
- Messaging or authentication error rates materially increase.
