# Phase 33.0 — Safety

## Decision shape

```json
{
  "allowed": true,
  "action": "ALLOW",
  "reasons": [],
  "policyVersion": "33.0.0"
}
```

Actions: `ALLOW` | `REDACT` | `REFUSE` | `ESCALATE`

## Pre-check

- Prompt injection heuristics  
- Unsafe content patterns  
- Forbidden action requests (send message, transfer funds, ban user, …)  

## Post-check

- Possible prompt leak redaction  
- Unsafe output refuse  

## Injection protection

- Separate system instructions from user content  
- `<<<UNTRUSTED_USER_CONTENT>>>` boundaries  
- No arbitrary tool/URL execution in 33.0  
- No secret access from model tools  
- Security events audited without storing full private prompts  

## Not in scope

Full moderation enforcement, automatic bans, autonomous tool execution.
