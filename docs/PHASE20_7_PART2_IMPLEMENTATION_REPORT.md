# Phase 20.7 Part 2 — Implementation Report

**Mode:** Implementation complete — **no production deploy** (Part 3)  
**Date:** 2026-07-18  
**Blueprint:** `PHASE20_7_PART1_ENTERPRISE_BLUEPRINT.md`

---

## Summary

Scrolitha is integrated as an **official, verified, 1:1 messaging assistant** powered by the existing Scrolitha orchestration stack (no parallel AI).

| Phase | Delivered |
|---|---|
| A System identity | Reuses `ensureScrolithaPlatformUser`; block protection; reserved usernames |
| B Conversation foundation | `ensureScrolithaDirectConversation` — exactly one DIRECT DM per user |
| C Messages integration | Pinned inbox row, AI badge, online indicator, dock via MessageContext |
| D Engine integration | `processScrolithaMessagingTurn` → `scrolithaChat` |
| E Persistence | Assistant replies as `DirectMessage` with metadata (actions, chips, session id) |
| F SupportWidget unification | Ensure DM on open; **Messages** deep-link to same conversation |
| G AI experience | Welcome seed, prompt chips, composer placeholder, disclosure strip |
| H Tools | Existing tool registry via `scrolithaChat` / suggestedActions |
| I Analytics | Ops counters + latency on messaging turns |
| J Tests | FE normalize tests + BE identity/bridge tests |

---

## Files added

### Backend

- `geezle-backend/src/services/scrolitha/scrolitha.messagingBridge.ts`
- `geezle-backend/src/services/scrolitha/__tests__/scrolitha.messagingBridge.spec.ts`

### Frontend

- `geezle/tests/unit/scrolithaMessagingNormalize.test.ts`

### Docs

- `docs/PHASE20_7_PART2_IMPLEMENTATION_REPORT.md`
- `docs/PHASE20_7_PART2_ARCHITECTURE.md` (this package)

---

## Files modified

### Backend

- `geezle-backend/src/services/scrolitha/scrolitha.rollout.ts` — `messagingAssistant` capability + env
- `geezle-backend/src/controllers/messages.controller.ts` — ensure endpoint, list ensure, postMessage hook, block guard, payload flags
- `geezle-backend/src/routes/messages.routes.ts` — `GET/POST /messages/scrolitha/ensure`

### Frontend

- `geezle/src/services/messaging.ts` — normalize Scrolitha flags; `ensureScrolithaConversation`
- `geezle/src/messages/Messages.tsx` — ensure on load, pin sort, AI chrome, chips
- `geezle/src/context/MessageContext.tsx` — ensure on shared inbox refresh (dock/header)
- `geezle/src/components/SupportWidget.tsx` — ensure DM + open in Messages

---

## New APIs

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/messages/scrolitha/ensure` | Ensure 1:1 Scrolitha DM; return conversation + chips + platform user |

Existing:

| Method | Path | Role |
|---|---|---|
| POST | `/api/messages/conversations/:id/messages` | User text → async Scrolitha turn when peer is Scrolitha |
| POST | `/api/scrolitha/chat` | Unchanged orchestration (used by bridge + SupportWidget) |

---

## Architecture conformance

| Blueprint rule | Status |
|---|---|
| No parallel AI stack | **YES** — reuses `scrolithaChat` |
| No Ollama replacement | **YES** |
| No messaging redesign | **YES** — additive hooks |
| No schema migration | **YES** |
| Single system identity | **YES** |
| Exactly one DM | **YES** — participant pair merge |
| SupportWidget same logical conversation | **YES** — ensure + Messages deep link; chat API still powers widget replies |
| Permissions | **YES** — tools via existing orchestration + rollout |
| No production deploy | **YES** |

---

## Rollout flags

| Flag / env | Default |
|---|---|
| `messagingAssistant` / `SCROLITHA_ROLLOUT_MESSAGING_ASSISTANT` | OFF in public defaults; ON for internal allowlist defaults |
| User-facing access | Still requires master or internal rollout for AI turns |

When master/internal access is off, ensure may still create the DM shell (welcome) depending on ensure path; AI turns skip with `messaging_assistant_disabled` / access denial.

**Note:** `isMessagingAssistantEnabled` currently returns true when user-facing access is allowed (so enabling master enables messaging). Dedicated flag can force-on via env.

---

## Test results

| Suite | Result |
|---|---|
| `tests/unit/scrolithaMessagingNormalize.test.ts` + messaging media | **23 pass** |
| `scrolitha.messagingBridge.spec.ts` | **4 pass** |

---

## Performance observations

- Ensure on inbox load is one extra lightweight call; failures are non-blocking  
- AI generation is async after user message response (does not block HTTP send)  
- Prompt chips and AI chrome are conditional (no cost for human chats)  

---

## Known limitations

1. SupportWidget still uses `/scrolitha/chat` for immediate widget replies; history is dual-written only when user sends via **Messages** (widget → Messages deep-link for full thread). Full single-store write-through from widget can be Part 2.1.  
2. Streaming tokens not yet rendered in messaging bubbles (flagged for Part 2.1).  
3. Action cards appear in message `metadata.suggestedActions` — rich card UI rendering is minimal (text + chips); full card components next.  
4. No authenticated e2e against production (deploy is Part 3).  
5. Markdown rendering uses existing message text display (limited syntax highlighting).  

---

## Risks

| Risk | Mitigation |
|---|---|
| AI latency | Async post-send generation + typing UX later |
| Duplicate DMs | Canonical participant-pair lookup |
| Bot loops | Skip when sender is Scrolitha |
| Block abuse | Cannot block platform user |
| Bundle | No new heavy deps |

---

## Part 3 readiness

| Criterion | Status |
|---|---|
| Implementation against Part 1 blueprint | **YES** |
| Additive only | **YES** |
| Unit tests green | **YES** |
| Production deploy | **NO** (forbidden in Part 2) |
| Ready for Part 3 (deploy/validate/certify) | **YES — with noted limitations** |

**Recommendation:** Proceed to **Phase 20.7 Part 3** after PR review, with staged rollout (`SCROLITHA_ROLLOUT_MESSAGING_ASSISTANT` / master) and authenticated smoke on web + dock + wrappers.
