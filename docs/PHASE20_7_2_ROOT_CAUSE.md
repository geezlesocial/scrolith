# Phase 20.7.2 — Root Cause Analysis

**Severity:** P1 production functional failure  
**Symptom:** User messages persist in Scrolitha DM; no assistant reply; no loading/error UI.

## Confirmed causes

### 1. Admin / moderator silent skip (primary for staff accounts)

`postMessage` only invoked the Scrolitha bridge when `!admin`:

```ts
if (text && senderId === userId && !admin) { processScrolithaMessagingTurn(...) }
```

Production allowlist includes `admin@scrolith.com`. Operators testing as **ADMIN** never triggered AI generation. User messages still saved. No error path. Matches observed silent failure exactly.

**Fix:** Remove admin exclusion for Scrolitha DM turns. Admins get the same assistant path.

### 2. Frontend HTTP timeout shorter than AI generation (all users)

- Global API timeout defaults to **~16s** (max 60s).
- Message POST **awaits** `processScrolithaMessagingTurn` (provider timeout default **25s+**).
- Client aborts before the server finishes AI; user message already committed.
- Assistant depended on socket after long await — easy to miss after client-side abort/retry.

**Fix:** Scrolitha sends use **95s** timeout; no automatic write-retry (avoids duplicate user turns); HTTP response includes `scrolithaTurn` with assistant payload so UI does not depend only on sockets.

### 3. No user-visible lifecycle states

Composer had no thinking / timeout / retry for Scrolitha. Silent empty thread after send.

**Fix:** “Scrolitha is thinking…”, recoverable error copy, retry control.

### 4. Provider model env gap (degrades quality, not total silence for non-admin)

Backend warns `SCROLITHA_CORE_MODEL` missing (endpoint set; model falls back to default `qwen3:14b` in code). Still set `SCROLITHA_CORE_MODEL=qwen3:14b` explicitly for production clarity.

## Non-causes

- Rich cards / streaming flags off — basic text path must not depend on them.
- Conversation unification flag off — Messages still uses `postMessage` bridge.
- Human messaging path — unaffected; change is Scrolitha-specific.
