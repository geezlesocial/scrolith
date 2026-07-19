# Phase 21.1.3 — Survey E2E

## Wiring (production code on p2112s)

| Surface | Mount | Cap |
|---------|-------|-----|
| Member Home | `MemberHomeSection` → `PostEngagementBar` → `ContentInterestSurvey` | 4 |
| Community | `CommunityHome` → same | 5 |
| Mobile feed | `MobileFeed` → same | 5 |
| Scroll | `/scroll` → `ScrollFeed` → `ScrollCard` | 4 |

## API contract

- Positive: `POST /posts/:id/interested` body `{ surface: "post_interest_survey" }`
- Negative: `POST /posts/:id/not-interested` body `{ surface: "post_interest_survey" }`
- Scroll: `POST /scroll/:id/interested|not-interested` with `scroll_interest_survey`

UI: `busySignal` blocks double-tap; submitted signal hides prompt; own content excluded.

## Authenticated click E2E

**Residual** — requires production login. Operator must confirm 2xx Network responses and persistence after refresh.
