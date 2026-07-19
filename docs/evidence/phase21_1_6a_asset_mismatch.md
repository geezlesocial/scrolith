# Phase 21.1.6A — Frontend Asset Mismatch Incident

**Date:** 2026-07-19  
**Symptom:** `https://scrolith.com` stuck on boot loader; `index-CqcjC73D.js` / `icons-GMrKlA6A.js` → **404**

## Root cause

**Staged Cloud Run traffic split (20% / 80%) without session affinity** caused HTML and hashed assets to be served from **different revisions**.

| Revision | Tag | Traffic (before fix) | Main bundle |
|----------|-----|----------------------|-------------|
| `scrolith-frontend-00198-jak` | p2115 | 20% | `index-CqcjC73D.js`, `icons-GMrKlA6A.js` |
| `scrolith-frontend-00131-4jr` | p2114i | 80% | `index-blwMSVJQ.js`, `icons-CIVBym7m.js` |

Each revision is **internally complete** (all of its own `/assets/*` return 200 on its tag URL).  
Cross-serving fails:

- p2114i + `index-CqcjC73D.js` → **404**
- p2115 + `index-blwMSVJQ.js` → **404**

Browser flow under split:

1. Document request hits **p2115** → HTML references `CqcjC73D` / `GMrKlA6A`
2. Asset request hits **p2114i** → **404**
3. App never fires `scrolith:app-ready` → permanent **Loading Scrolith...**

Not an application logic bug. Not incomplete Docker build for either revision.

## Fix applied

```text
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 \
  --to-revisions=scrolith-frontend-00131-4jr=100
```

- **Active production:** `scrolith-frontend-00131-4jr` (p2114i) **100%**
- **Staged p2115 retained at 0%** (tag URL still valid for cert)

Chose p2114i because Phase 21.1.5 was **not** production-certified; split was only for staging.

## Verification

- Live HTML consistently references `index-blwMSVJQ.js` + `icons-CIVBym7m.js`
- Those assets return **HTTP 200** on `scrolith.com`
- p2115 tag still self-consistent for future canary

## Operator note

Users who still see the loader should hard-refresh (`Ctrl+Shift+R`) once to drop any cached p2115 HTML.

## Prevention

Do **not** canary hashed SPAs with multi-revision traffic unless:

- session affinity is guaranteed for HTML + assets, **or**
- a shared asset CDN holds **all** hashes from both builds, **or**
- canary is done via tagged URL only (0% public traffic) until promote to 100%
