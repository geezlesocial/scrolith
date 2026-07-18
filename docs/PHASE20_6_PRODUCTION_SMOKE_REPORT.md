# Phase 20.6 — Production Smoke Report

## Automated / unauthenticated

| Check | Result | Status |
|---|---|---|
| Homepage 200 | YES | **completed** |
| /messages SPA shell 200 | YES | **completed** |
| New FE revision 100% | `00145-dez` | **completed** |
| New BE revision 100% | `00116-qoc` | **completed** |
| Production JS includes fix markers | YES (`MessageAttachmentRenderer-B4zgcnBb.js`) | **completed** |
| p204 still 0% | YES | **completed** |
| p203 reachable | YES | **completed** |
| p2041 reachable | YES | **completed** |

## Authenticated matrix (requires operator session)

| Check | Status |
|---|---|
| Full-page image sent + preview | **pending operator** (auth) |
| Full-page image received + preview | **pending operator** |
| Video load-on-demand + play | **pending operator** |
| Audio / PDF / download | **pending operator** |
| Messaging dock image/video | **pending operator** |
| Android WebView | **pending operator** (same web shell) |
| Desktop app | **pending operator** (same web shell) |
| Hard refresh historical attachment | **pending operator** |
| Console clean (CORS/CSP/401 loops) | **pending operator** |

## Gate honesty

Phase 20.6 **code + deploy complete**. Full “sender+recipient image/video on dock+full page” certification still needs a logged-in production operator pass because automation cannot authenticate as messaging users in this environment.
