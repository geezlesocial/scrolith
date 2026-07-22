# Messaging Group Member Testing

Completed local checks:

- Frontend production build: PASS.
- URL tokenization unit tests: PASS.
- Mention rendering regression tests: PASS.
- Backend production build: BLOCKED by pre-existing TypeScript errors outside this change set.

Focused URL cases covered:

- Internal Scrolith URL.
- External HTTPS URL.
- `www.` shorthand normalization.
- Bare `scrolith.com` route normalization.
- Trailing punctuation.
- Parentheses.
- Unsafe schemes.
- Embedded credentials.
- Email address non-linkification.
- API path non-SPA routing.

Group member validation implemented:

- Username resolver.
- Leading `@` username resolver.
- Exact email resolver without email echo.
- Exact user ID resolver.
- Duplicate member rejection.
- Pending invitation rejection.
- Owner/admin authorization preservation.
- Block/privacy gate preservation.
- Group capacity check.
- Audit event creation.
- Notification creation.

Authenticated production validation: not completed in this run.

