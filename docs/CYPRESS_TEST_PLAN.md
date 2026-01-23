# Cypress Test Plan — Dashboards (Geezle)

Purpose
- End-to-end regression tests for key dashboard flows for Freelancer and Employer roles.
- Must run against local dev at `http://localhost:5173` (or configured baseUrl).

Test strategy
- Smoke suite: login, overview metrics, messages unread counts, basic navigation.
- Critical flows: create gig/job, submit for review, messages, wallet withdraw request, KYC submit, hourly tracker start/stop.
- Real-time checks: verify socket events update UI (tests can simulate by calling API endpoints that trigger server emits, or by stubbing sockets in unit tests).

Test data
- Use seeded admin + seeded analytics created earlier.
- Cypress tests should use a disposable test user or an environment account; clear state before/after tests.

Folder structure (Cypress)
```
cypress/
  e2e/
    dashboard_overview.cy.ts
    freelancer_gigs.cy.ts
    employer_jobs.cy.ts
    wallet_withdrawals.cy.ts
  fixtures/
  support/
    commands.ts
    e2e.ts
```

Guidelines
- Prefer API seeding via backend scripts (seed_analytics, create_admin) before running tests.
- Use `cy.request()` for fast setup (create gig, job) and `cy.visit()` to assert UI.
- Avoid fragile selectors; use `data-cy` attributes in UI components for stable targeting.

Starter spec: dashboard_overview.cy.ts
- Validates:
  - Login as `admin@local.test` or a test freelancer (via API or UI)
  - Visit `/freelancer/dashboard` and assert overview cards exist
  - Assert unread messages/notifications counts are visible
  - Assert revenue / wallet balances show numeric values

See `cypress/e2e/dashboard_overview.cy.ts` for starter code.

Runner
- Run locally:
```bash
# ensure backend seeded
cd geezle-backend
npm run seed:analytics
npm run create:admin
# start backend and frontend in separate shells
# run cypress
npx cypress open
# or headless
npx cypress run --spec "cypress/e2e/dashboard_overview.cy.ts"
```

Reporting & CI
- Add to CI pipeline; use `cypress run` with `--record` if using Cypress Dashboard.
- Fail build on any critical test failure.

