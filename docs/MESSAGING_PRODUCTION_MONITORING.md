# Messaging Production Monitoring

Date: 2026-07-23

Monitoring status: NOT STARTED

No new production revision was deployed and no traffic was shifted, so production monitoring was not started for this release.

When unblocked, monitor:

- Cloud Run backend 5xx rate
- Messaging endpoint 4xx/5xx changes
- Cloud SQL Prisma pool errors, especially P2024
- Request latency
- Authentication failures
- Messaging URL join/support behavior
- Group-member addition behavior
