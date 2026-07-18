# Phase 20.7.2 — Executive Summary

## Result

**COMPLETE — BASIC RESPONSE RECOVERED, OPTIONAL CAPABILITIES DISABLED**

## Incident

Scrolitha DM accepted user messages but returned no assistant reply and showed no thinking/error UI.

## Root cause (primary)

Message POST **silently skipped** Scrolitha AI generation for **admin/moderator** accounts (`!admin` guard). Staff testers (including `admin@scrolith.com` on the allowlist) never received replies.

Secondary: frontend default **~16s** timeout aborted awaited AI generation; assistant relied on socket only; no thinking/error states.

## Recovery deployed

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Backend | `scrolith-backend-00124-rom` | p2072 | 100% |
| Frontend | `scrolith-frontend-00155-goh` | p2074 | 100% |

Also set `SCROLITHA_CORE_MODEL=qwen3:14b` explicitly.

## Optional 20.7.1 capabilities

Remain **off** (write tools, streaming, cards, confirmation tokens, file understanding, tool execution). Progressive enablement deferred until operator-authenticated smoke of basic replies.

## Rollback

FE → `00153-qid` (p2073) or `00151-fin` (p2072).  
BE → `00122-taj` (p2071) or `00089-f5h`.
