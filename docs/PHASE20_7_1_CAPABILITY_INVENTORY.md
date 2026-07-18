# Phase 20.7.1 — Capability Inventory

**Date:** 2026-07-18  
**Baseline:** FE `scrolith-frontend-00151-fin` (p2072) / BE `scrolith-backend-00089-f5h`

## Tool registry (backend `scrolitha.tools.ts`)

| Key | Risk class | Messaging-safe | Confirmation | Scope |
|---|---|---|---|---|
| GET_ME_PROFILE | read_only | yes | no | user |
| GET_UPLOADED_FILES | read_only | yes | no | user |
| UPLOAD_FILE_TO_LIBRARY | write | no | yes | user |
| CREATE_GIG | draft | no | yes | user |
| SUBMIT_GIG_FOR_REVIEW | write | no | yes | user |
| CREATE_JOB | draft | no | yes | user |
| CREATE_TICKET | write | no | yes | user |
| BLOCK_USER | destructive | no | yes | user |
| FOLLOW_USER | write | no | yes* | user |
| FETCH_NOTIFICATIONS | read_only | yes | no | user |
| MARK_NOTIFICATION_READ | write | no | yes* | user |
| GET_MY_ORDERS | read_only | yes | no | user |
| GET_MY_MEMBERSHIP_STATUS | read_only | yes | no | user |
| GET_MY_WALLET_SUMMARY | read_only | yes | no | user |
| GET_MY_GCOIN_SUMMARY | read_only | yes | no | user |
| GET_MY_ADS_OVERVIEW | read_only | yes | no | user |
| GET_MY_AFFILIATE_OVERVIEW | read_only | yes | no | user |
| GET_MY_MONETIZATION_STATUS | read_only | yes | no | user |
| GENERATE_PROJECT_BRIEF | draft | no | yes | user |
| SEARCH_USERS | read_only | yes | no | user |
| UPDATE_USER_STATUS | administrative | no | yes | admin |
| REVIEW_MONETIZATION_APPLICATION | administrative | no | yes | admin |
| CREATE_ROLE | administrative | no | yes | admin |
| UPDATE_ROLE_PERMISSIONS | administrative | no | yes | admin |
| MODERATE_POST | administrative | no | yes | admin |
| REVIEW_ADS | administrative | no | yes | admin |
| UPDATE_SCROLITHA_POLICIES | administrative | no | yes | admin |
| VIEW_SCROLITHA_AUDIT_LOGS | administrative | no | no* | admin |

\* Inferred by risk-class annotation when not explicitly set on the original tool definition.

## Phase 20.7.1 feature flags (independent, default **false**)

| Capability | Env | Production default after deploy |
|---|---|---|
| conversationUnification | SCROLITHA_ROLLOUT_CONVERSATION_UNIFICATION | false (write-through still works when messagingAssistant=true) |
| messagingStream | SCROLITHA_ROLLOUT_MESSAGING_STREAM | false |
| richEntityCards | SCROLITHA_ROLLOUT_RICH_ENTITY_CARDS | false |
| toolExecution | SCROLITHA_ROLLOUT_TOOL_EXECUTION | false |
| toolWriteActions | SCROLITHA_ROLLOUT_TOOL_WRITE_ACTIONS | false |
| confirmationTokens | SCROLITHA_ROLLOUT_CONFIRMATION_TOKENS | false |
| fileUnderstanding | SCROLITHA_ROLLOUT_FILE_UNDERSTANDING | false |
| qualityFeedback | SCROLITHA_ROLLOUT_QUALITY_FEEDBACK | false |

## Pre-existing live flags (p207 baseline)

MASTER=true, MESSAGING_ASSISTANT=true, STREAMING=true (provider abstraction), ACTION_CARDS=true, INTERNAL_ROLLOUT=true.

## Surfaces

| Surface | Status |
|---|---|
| /messages Scrolitha DM | Live (20.7) |
| Messaging Dock presence | Live (20.7) |
| SupportWidget deep-link | Live (20.7) |
| SupportWidget write-through | **Implemented 20.7.1** via `/messages/scrolitha/turn` |
| SSE stream | **Implemented 20.7.1** gated by messagingStream |
| Rich entity cards UI | **Implemented 20.7.1** gated by richEntityCards + metadata |
| Confirmation tokens | **Implemented 20.7.1** gated by confirmationTokens |
| Full binary PDF/DOCX OCR | **Not implemented** — metadata-only untrusted context |

## Activation policy

1. Read-only tools: require `toolExecution` (or messagingSafe + messaging surface).  
2. Draft/write/destructive: require `toolExecution` **and** `toolWriteActions`.  
3. Administrative: admin actor only; never ordinary users.  
4. Confirmation tokens: single-use, user/tool/action bound, short TTL.
