# Phase 20.7.3 — Intent Routing Root Cause

## Production baseline

- FE `scrolith-frontend-00155-goh` (p2074)  
- BE `scrolith-backend-00124-rom` (p2072)  
- Recovery path works; quality/routing incorrect.

## Incident A — “Find jobs for me”

**Observed:** “I prepared one action: Reviews membership, wallet funding, ad performance, referrals, and retention levers for employers.”

### Trace (pre-fix)

| Step | Result |
|---|---|
| Normalized text | `find jobs for me` |
| Keyword tools | no exact job tool in registry |
| Skill match | **BROKEN** — tokens `for` / `me` / `jobs` substring-match skill descriptions |
| Selected skill | Employer growth / membership retention skill |
| Action plan | Created from skill step tool `GET_MY_MEMBERSHIP_STATUS` (or similar) |
| LLM | Often null → heuristic path |
| `buildFallbackReply` | “I prepared one secure next step: …” + account context + policy boilerplate |

### Root cause

1. Skill matcher used **any token substring** in skill text (`token && hay.includes(token)`).  
2. Short tokens (`for`, `me`, `hi`) matched almost any English skill description.  
3. Explicit job intent never had first-class routing.  
4. Role/admin context did not fix wrong skill — wrong skill selected before role refinement.

## Incident B — “Hi”

**Observed:** “I prepared one secure next step: Guides through uploading a file…”

### Trace (pre-fix)

| Step | Result |
|---|---|
| Greeting detection | **Missing** (no early conversational branch) |
| Skill match | token `hi` matches descriptions containing **“which” / “this” / “while”** |
| Selected skill | File upload skill |
| Fallback formatter | “I prepared one secure next step” + Role/Scope context |

### Root cause

1. No greeting-first priority.  
2. Same broken skill matcher.  
3. Fallback injected internal account context (Role/Scope/Route).

## Fix summary

- New `scrolitha.intentRouter.ts` with explicit hierarchy.  
- Greetings/thanks/help before tools.  
- Job search explicit patterns; never employer growth.  
- Safe skill match (min token length 4, multi-hit score).  
- User-facing response boundary (no role/scope/policy in body).  
- Deterministic replies for conversation + job/freelancer when tools off.
