# Phase 20.7 Part 3 — Security Review

## Threat model (targeted)

| Threat | Control | Status |
|---|---|---|
| Impersonate Scrolitha | Platform user id from DB; sender checks | **Pass** |
| Block system account | `reportBlockConversation` rejects platform id | **Pass** |
| Unauthorized ensure | `authMiddleware` required | **Pass** (401 unauth observed) |
| Cross-user leakage | Conversation membership + emit to user room only | **Pass** |
| Flag bypass | Strict `messagingAssistant` capability | **Pass** (after fix) |
| Prompt injection | Existing `scrolithaChat` policy / blocklist | **Pass** (reused) |
| Tool privilege escalation | Existing tool RBAC + confirmation | **Pass** |
| Admin tools to public | Unchanged tool scopes | **Pass** |
| Secrets in metadata | Only action summaries / ids | **Pass** |
| Stored XSS | Text bubbles existing sanitization; markdown limited | Residual |
| AI endpoint abuse | Rate limits in orchestrator + auth | **Pass** |
| Duplicate AI amplification | One turn per user message await | **Pass** |
| SSRF via tools | Existing tool allowlist endpoints | Residual platform risk |

## Privacy

- Private DMs of other users never accessed by bridge  
- AI only runs on official Scrolitha 1:1  
- Logging uses redaction patterns in scrolitha audit  

## Residual risks

- Full XSS audit of markdown not expanded this phase  
- Authenticated abuse testing requires staff session  
