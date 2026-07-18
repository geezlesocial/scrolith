# Phase 20.7 Part 3 — PR Review

**Date:** 2026-07-18  
**PRs:** #81 (FE), #82 (BE)

## Continuity pre-check

| Item | Result |
|---|---|
| FE PR #81 base | `main` · MERGEABLE → **MERGED** `1c7b9f5e` |
| BE PR #82 base | `release/backend-production` · MERGEABLE → **MERGED** `311a6557` |
| FE tip | `f951b7b8` (includes Part 3 fix after `5577f940`) |
| BE tip | `07d4b99c` (includes Part 3 fix after `75b76ba2`) |
| Production baseline before deploy | FE `00145-dez` p206 · BE `00116-qoc` p206 |
| p204 traffic | 0% |

## Backend findings (PR #82 + fix)

| Area | Finding | Severity | Disposition |
|---|---|---|---|
| System identity | Uses `ensureScrolithaPlatformUser` / username+email | OK | Accept |
| Exactly-one DM | Participant-pair canonical key; create only when missing | OK | Accept (app-level; no migration) |
| Welcome seed | Count==0 only | OK | Accept |
| Message intercept | Only Scrolitha DM + human sender | OK | Accept |
| **Async fire-and-forget** | Cloud Run risk of dropped AI work | **Release-blocking** | **Fixed** in `07d4b99c` — await turn |
| **Rollout flag bypass** | `isMessagingAssistantEnabled` fell back to true when master access on | **Release-blocking** | **Fixed** — strict `messagingAssistant` capability |
| Ensure when disabled | Created DMs for all users | **High** | **Fixed** — 403 / no create when disabled |
| Socket emit | Same `messages:new` contract via `emitToUser` | OK | Accept |
| Metadata | Stores actions/chips/session id; no secrets | OK | Accept |
| Block protection | Platform user cannot be blocked | OK | Accept |

## Frontend findings (PR #81 + fix)

| Area | Finding | Severity | Disposition |
|---|---|---|---|
| Ensure lifecycle | Called on Messages load + MessageContext refresh | OK | Accept |
| **Force refresh always** | `force: true` after every ensure | Med | **Fixed** in `f951b7b8` |
| Pin sort | AI pin before starred/time | OK | Accept |
| Identity badges | Server `is_scrolitha` / username | OK | Accept |
| SupportWidget | Ensure + Messages deep-link | OK | Accept (known dual-path chat) |
| Media path | Unchanged | OK | Accept |

## Verdict

**APPROVED FOR MERGE** after Part 3 targeted fixes (`07d4b99c`, `f951b7b8`).
