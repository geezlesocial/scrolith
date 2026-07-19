# Phase 20.7.8 — Encryption Audit

## Finding

**B. TRANSPORT AND STORAGE ENCRYPTION ONLY**

## Evidence

| Question | Answer |
|---|---|
| Are DMs E2EE? | **No** — plaintext stored in Postgres (`DirectMessage.text`) |
| Are Scrolitha chats E2EE? | **No** — server-side AI must read content |
| Can server read plaintext? | **Yes** |
| Can AI orchestration read plaintext? | **Yes** (`processScrolithaMessagingTurn`) |
| Attachments E2EE? | **No** — server storage + content API |
| Device identity keys / safety numbers? | **None** |
| TLS in transit? | **Yes** (HTTPS Cloud Run) |

## UI implication

“Verify End-to-End Encryption” must **not** show a successful verification code.

It must state E2EE is unavailable and explain TLS + server processing.

Code: `getScrolithaMessageSecurityStatus()` in `scrolitha.publicProfile.ts`.
