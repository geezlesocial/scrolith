# G1 staging API verification runner (proposal)

Status: **PROPOSAL ONLY — NOT RUN; NOT DAST; DOES NOT CLEAR G1**

This small Node.js runner is limited to a fixed set of unauthenticated health
checks. It is not an API security scanner, route crawler, penetration test, or
replacement for independent authenticated DAST. Security-owner acceptance of
this limited verification is required separately and does not itself mark G1
passed.

## Repository evidence and current limitation

No scanner product, version, launch workflow, or saved scanner configuration
was found in tracked repository files. An external scanner UI/account cannot
be verified from this repository. The previously recorded G1 window is expired;
the runner must not be started until a new written scope and window are
approved.

## Fixed scope

Only the exact configured HTTPS origin for a revision-specific staging
Container Apps candidate is accepted. The runner rejects app-level hosts,
other hosts, paths, queries, fragments, and all routes/methods except:

| Method | Path |
| --- | --- |
| GET, HEAD | `/api/health` |
| GET, HEAD | `/api/readyz` |
| GET, HEAD | `/api/health/ready` |
| GET | `/api/auth/health` |

The root path `/` is not allowed. Redirects are not followed; cross-origin
redirects fail immediately. The client omits credentials and never reads
response bodies. It does not crawl, discover routes, submit forms, authenticate,
or send write requests.

## Fixed limits

- One sequential worker (one process-wide request lane).
- At least one second between every actual request attempt, including retries.
- 300 total HTTP attempts maximum; retries count toward the cap.
- 10-second per-request timeout, bounded further by the approved window end.
- At most one retry, only for these idempotent GET/HEAD checks.
- Approved window start and end are mandatory UTC values; maximum window is
  30 minutes. The process stops at the end and aborts an in-flight request.
- No CLI option or environment override can increase these controls.

## Required configuration

Supply values only to the local process from an approved restricted release
record. Do not commit them or paste them into CI logs, issues, or reports.

- `G1_API_ORIGIN`: exact direct candidate origin (HTTPS, revision-specific
  `*.azurecontainerapps.io` host); no path or trailing URL components.
- `G1_WINDOW_START_UTC`: start from a current written authorization, RFC3339
  UTC ending in `Z`.
- `G1_WINDOW_END_UTC`: end from the same approval, within 30 minutes of start.

Missing, malformed, expired, or not-yet-open settings fail closed before any
HTTP request. No identity or credential is supported or required; if a route
requires authentication, stop and seek separate approval rather than adding
credentials to this runner.

## Review-only commands

Mocked tests only:

```sh
npm run test:g1:api-verification
```

The live command is intentionally separate and must not be used without a new
written approval and review of this proposal:

```sh
npm run g1:api-verification
```

The runner prints only method, fixed path, status/outcome, attempt count, and
elapsed time; never include credentials, response bodies, or the configured
origin in retained evidence. Store any approved run evidence in the restricted
release location. This proposal has not been run against staging.

## Controls requiring separate review/approval

- Approve the exact candidate origin and a new future UTC window in the
  restricted authorization record.
- Confirm the active scanner is stopped and its saved configuration does not
  include `/` or any route outside this fixed allowlist.
- Obtain explicit security-owner acceptance if this limited check is intended
  to count toward G1; it does not replace independent DAST.
- Do not use privileged accounts, signup/login, or authenticated paths under
  this runner. Broader authenticated testing needs a separate approved tool,
  identity scope, rules of engagement, limits, and test window.
