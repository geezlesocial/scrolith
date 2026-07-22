# Messaging Group Member Deployment

Deployment status: not performed.

Reason:

- Backend production TypeScript build passes.
- Full backend regression remains blocked because Docker is not installed and the isolated PostgreSQL service cannot be started locally.
- No production deployment was attempted after that gate failed.

Recommended deployment sequence after backend build baseline is restored:

1. Create production database backup.
2. Record current frontend and backend Cloud Run revisions.
3. Build immutable frontend and backend images.
4. Deploy candidates at 0 percent traffic.
5. Run authenticated candidate smoke tests.
6. Promote 5 percent, 25 percent, 50 percent, then 100 percent.
7. Validate messaging links, member resolution by username/email/user ID, audit logs, notifications, latency, and error rates at each stage.

Migration status: no migration required.

Production database status: not touched by tests or deployment commands in this phase.
