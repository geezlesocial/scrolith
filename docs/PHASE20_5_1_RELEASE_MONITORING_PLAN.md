# Phase 20.5.1 — Release Monitoring Plan

**Date:** 2026-07-18  
**Applies after:** Operator starts Android staged production rollout and/or desktop public adoption of 1.1.19

## Status

| Item | Status |
|---|---|
| Monitoring plan defined | **completed** |
| Active Play vitals monitoring for 1.1.19 | **pending operator approval** (starts after rollout) |
| Active desktop download error monitoring | **pending operator approval** |

---

## What to monitor

| Signal | Primary source | Cadence (first 48h) |
|---|---|---|
| Crash rate | Play Console → Android vitals | Continuous / 4h review |
| ANR rate | Android vitals | Continuous / 4h review |
| Startup failures | Play vitals + support tickets | 4h |
| Login failures | Backend auth error rates / FE logs | 1–4h |
| Dashboard errors / ErrorBoundary | Frontend telemetry / support | 1–4h |
| WebView failures | Mobile telemetry events | 4h |
| Camera failures | Mobile telemetry + tickets | 4h |
| Upload failures | Backend upload endpoints + FE | 4h |
| Notification failures | FCM / push telemetry | 4h |
| Device exclusions | Play bundle details | After processing |
| User reviews | Play Console reviews | Daily |
| Pre-launch report | Play Console | After upload |
| Release adoption | Play release dashboard | Daily |
| Backend error rates | Cloud Monitoring / logs | Continuous |
| Frontend ErrorBoundary reports | App analytics | Continuous |
| Desktop download 4xx/5xx | GCS / CDN logs if enabled | Daily |

---

## Health gates before increasing rollout

Do **not** increase past 5% (or next step) unless **all** of the following hold for a stable observation window (recommend **≥ 24 hours** or **≥ meaningful install cohort**):

| Gate | Pass criteria |
|---|---|
| No new critical crash cluster | No new top crash signature unique to 1.1.19 with material volume |
| No significant ANR regression | ANR rate not materially worse vs prior production baseline |
| No dashboard render regression | No elevated ErrorBoundary / white-screen reports on freelancer/employer dashboards |
| No authentication regression | Login success rate stable; no spike in 401/5xx auth |
| No media upload regression | Image/video upload error rate stable |
| No notification routing regression | Deep-link / notification open failures not elevated |
| No Play policy blocker | No new policy rejection or enforced take-down risk |

### Recommended staged steps

1. **5%** initial production (or console minimum)  
2. Hold + monitor  
3. **20%** if gates pass  
4. Hold + monitor  
5. **50%** if gates pass  
6. Hold + monitor  
7. **100%** only after gates pass and operator approval  

---

## Alert / halt triggers (immediate)

Halt staged rollout (see rollback plan) if any of:

- Crash-free sessions drop sharply vs baseline  
- ANR rate crosses org threshold  
- Authentication outage correlated with mobile release  
- Widespread dashboard ErrorBoundary (similar to p204 incident class)  
- Media pipeline total failure  
- Policy / security critical finding  

---

## Ownership

| Role | Responsibility |
|---|---|
| Release Manager | Rollout % decisions |
| SRE | Backend/FE error budgets |
| Mobile owner | Play vitals interpretation |
| Support | Review triage |
| Security | Policy / integrity incidents |

## Status of this document

**completed** as plan. Active monitoring **pending** rollout start.
