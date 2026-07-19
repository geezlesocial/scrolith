# Phase 21.1.4 — Feed Session Integrity Stress Test

## Deployed

| Item | Value |
|------|--------|
| Revision | `scrolith-frontend-00131-4jr` |
| Tag | `p2114i` |
| Commit | `cd146e66` |
| Prior stability fix | `00130-dhz` / p2114 (`bf830417`) |

## Purpose

Continuously verify that a feed session remains identity-stable during:

- normal scrolling  
- background recommendation fetches  
- socket updates  
- network offline → online  
- browser/tab hidden → visible  
- reactions, follows, comments  
- interest survey submission  
- new posts arriving (pending buffer only)  
- multiple pagination events  

## Tracked fields (privacy-safe)

| Field | Meaning |
|-------|---------|
| `sessionId` | Feed integrity session |
| `visiblePostId` | Substantially visible post |
| `visibleAuthorId` | Author of that post |
| `orderedItemHash` | Hash of full ordered ID list |
| `visibleAnchorId` | Anchor for reading continuity |

These must **not** change unless the user explicitly:

- hard refreshes / tab change / new session  
- taps **Show new posts**  
- scrolls (visible post may change only with `scroll_user`)  

Any other visible post ID change is logged as:

```text
[feed-session-integrity:REGRESSION]
```

## How to enable in browser

```js
localStorage.setItem('scrolith:feedIntegrityProbe', '1')
// hard refresh
```

Also on in `import.meta.env.DEV`.

Member Home exposes:

- `data-feed-integrity-session`
- `data-feed-integrity-enabled`

## Automated stress

```bash
node --import tsx --test src/utils/__tests__/phase2114FeedIntegrityStress.spec.ts
```

Covers a multi-step continuous session and the illicit soft-refresh reorder regression.

## Operator 30–60 minute session

1. Enable probe (`localStorage` flag).  
2. Stay authenticated on Member Home.  
3. Perform the activities listed above for 30–60 minutes.  
4. Watch console for `[feed-session-integrity:REGRESSION]`.  
5. Zero regressions required for stress PASS.

## Full certification evidence (required)

| Surface | Test |
|---------|------|
| Member Home | One post visible ≥60s — identity never changes |
| Community | Same |
| /scroll | Same |
| Android wrapper | Resume from background — same |

Attach videos under `docs/evidence/` when complete. Until then production certification remains **conditional**.
