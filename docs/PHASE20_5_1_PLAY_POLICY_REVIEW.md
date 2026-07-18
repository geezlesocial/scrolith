# Phase 20.5.1 — Play Policy & App Content Review

**Date:** 2026-07-18  
**Rule:** Do **not** change legal or policy declarations without explicit evidence. Document every operator decision.

## Overall status

| Area | Status |
|---|---|
| Pre-flight technical content (from AAB / prior phases) | **completed** |
| Live Play Console section review | **pending operator approval** |
| Declaration changes | **not applicable** unless Console requires evidence-based update |

---

## Review matrix

| Play Console section | Operator action | Status |
|---|---|---|
| App content | Open and confirm complete / no new blockers | **pending operator approval** |
| Data safety | Confirm declarations still match actual collection/sharing | **pending operator approval** |
| Privacy policy | Confirm URL live and linked | **pending operator approval** |
| Ads declaration | Confirm ads presence/absence still accurate | **pending operator approval** |
| Content rating | Confirm questionnaire current | **pending operator approval** |
| Target audience | Confirm age groups | **pending operator approval** |
| News declaration | Confirm N/A or correct | **pending operator approval** |
| Financial features | Confirm if wallet / payments UI triggers forms | **pending operator approval** |
| Account deletion | Confirm in-app / web deletion path still valid | **pending operator approval** |
| App access instructions | Confirm demo accounts if required for review | **pending operator approval** |
| Permissions declarations | Align with manifest (camera, mic, notifications, media, location if used) | **pending operator approval** |
| Sensitive permissions | Review any special-use claims | **pending operator approval** |
| Foreground service declarations | Confirm if FGS types declared match usage | **pending operator approval** |
| Photo/video permissions | Android 13+ READ_MEDIA_* present in 20.5 AAB | **completed** (manifest); Console form **pending operator** |
| Microphone / camera disclosures | Confirm store disclosures match features | **pending operator approval** |
| Data collection & sharing | Cross-check Data safety form | **pending operator approval** |
| Play App Signing | Confirm upload key accepted | **pending operator approval** (cert identity locally verified) |
| App integrity | Record Play Integrity / signing status after processing | **pending operator approval** |
| Store listing completeness | Screenshots, description, graphic assets | **pending operator approval** |
| Country availability | Confirm intended countries | **pending operator approval** |
| Device compatibility | Record exclusions after bundle processing | **pending operator approval** |
| Policy status | No open policy strikes assumed; verify Console | **pending operator approval** |
| Publishing overview | Confirm no blockers before rollout | **pending operator approval** |

---

## Technical permission inventory (from Phase 20.5 AAB — do not invent new claims)

Operators should verify Console declarations still cover:

- Camera / image capture  
- Microphone (if video/audio capture enabled)  
- Notifications / push (FCM present historically)  
- Media library access (READ_MEDIA_IMAGES / VIDEO where applicable)  
- Network access  
- Deep links to `scrolith.com`  
- Optional location only if still declared and used  

**Do not expand** sensitive permission claims without product + legal sign-off.

---

## Account deletion compliance

| Check | Status |
|---|---|
| Account deletion path exists on platform (web/settings) | **pending operator approval** (confirm live path in Console form) |
| Play form lists correct URL / steps | **pending operator approval** |
| No regression expected from AAB-only shell update | **completed** (web baseline p2041 unchanged for deletion flows) |

---

## Operator decision log

| # | Section | Decision | Evidence | Approver | Date |
|---|---|---|---|---|---|
| 1 | _(template)_ | No change / Updated / Deferred | | | |

---

## Gates

| Gate | Result |
|---|---|
| APP CONTENT REVIEWED | **NO** (Console pending) |
| DATA SAFETY REVIEWED | **NO** (Console pending) |
| ACCOUNT DELETION COMPLIANCE REVIEWED | **NO** (Console pending) |
| PLAY WARNINGS REVIEWED | **NO** (pending upload) |

## Policy

Changing Data safety, privacy policy URL, ads declaration, target audience, or financial features **requires explicit written evidence** and is out of scope for automation in 20.5.1.
