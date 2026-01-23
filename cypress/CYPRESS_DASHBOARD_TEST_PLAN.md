# Cypress Dashboard Test Plan — Geezle

This plan covers regression test cases for Freelancer & Employer dashboards focusing on critical flows and the Uploaded Files global module.

Test areas (priority):
1. Uploaded Files (global)
  - Upload file -> appears in list
  - Preview image/pdf/video
  - Copy URL
  - Delete with confirm
  - "Used in" indicator present
  - FilePicker modal can select existing file and returns selection to parent flow

2. Freelancer flows
  - Create Gig -> appears as draft in My Gigs
  - Submit Gig -> status becomes `under_review`
  - Admin approves (simulated) -> gig status updates via socket (or intercept) to `approved`
  - Orders list loads, deliver flow posts files, shows timeline
  - KYC submit form -> status becomes `pending`
  - Hourly tracker: start -> stop -> time entry persisted

3. Employer flows
  - Create Job with Uploaded File attachment -> appears in My Jobs
  - Receive proposal -> accept creates contract
  - Escrow fund/release flows update balances

4. Realtime
  - Unread counters for messages & notifications update when `messages:new` / `notifications:new` are emitted
  - Fallback polling triggers when socket disconnected

5. UI quality
  - No dead/broken buttons
  - Confirm modals exist for destructive actions
  - Skeleton loaders present on list loads

Running tests
- Configure baseUrl in `cypress.config.ts` to `http://localhost:3000`
- Use `cy.intercept` for stable CI runs; prefer full e2e against test backend when available.

Starter spec location: `cypress/e2e/dashboard_starter_spec.cy.ts` (includes sample tests for Uploaded Files and Create Gig)

End of test plan.
