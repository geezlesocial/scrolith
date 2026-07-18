# Phase 20.4.1 — Incident Report

**Severity:** P0 Production  
**Title:** Dashboard Overview TDZ render crash (freelancer + client)  
**Status:** RESOLVED  

## Timeline (UTC approximate, 2026-07-18)

| Time | Event |
|---|---|
| Phase 20.4 deploy | `scrolith-frontend-00140-zaq` (p204 / `0a54dde6`) promoted 100% |
| Detection | Users/screenshots show ErrorBoundary on both dashboard routes |
| Console | `ReferenceError: Cannot access 'p' before initialization` in Overview chunk |
| Mitigation | Traffic rolled back to **`scrolith-frontend-00138-ruh` (p203)** — dashboards restored |
| Root cause | Confirmed TDZ: `unreadNotifications` after `loadOverview` deps |
| Fix | PR #77 — reorder declarations; regression tests |
| Recovery deploy | New image `p2041-3f69246a` → new revision (see deployment report) |

## Affected systems

| Surface | Impact |
|---|---|
| Frontend Overview chunks | Crash on mount |
| Backend | None (unchanged `00114-bay`) |
| Member Home / growth APIs | Unaffected |

## Emergency rollback status

**Executed successfully.** Production FE returned to p203 (`00138-ruh`) before fix deploy. Backend traffic never changed.

## Fix artifacts

| Item | Value |
|---|---|
| PR | https://github.com/geezlesocial/scrolith/pull/77 |
| Merge SHA | `3f69246a` |
| Branch | `fix/phase20-4-1-overview-tdz` |

## Related reports

- `PHASE20_4_1_ROOT_CAUSE_ANALYSIS.md`
- `PHASE20_4_1_IMPLEMENTATION_REPORT.md`
- `PHASE20_4_1_DEPLOYMENT_REPORT.md`
- `PHASE20_4_1_VALIDATION_REPORT.md`
- `PHASE20_4_1_PREVENTION_ACTIONS.md`
