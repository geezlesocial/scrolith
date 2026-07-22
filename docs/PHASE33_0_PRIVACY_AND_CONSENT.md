# Phase 33.0 — Privacy and Consent

## Privacy levels

| Level | Examples | External models |
|-------|----------|-----------------|
| PUBLIC | Public post text | Allowed if consent |
| INTERNAL | Staff-only notes | Allowed if consent |
| PERSONAL | Emails, notifications | Prefer internal |
| SENSITIVE | Private messages | External only with consent |
| HIGHLY_SENSITIVE | Wallet / payment | Internal only |
| PROHIBITED | Secrets, JWT secrets, MFA seeds | **Never sent** |

## Redaction pipeline

1. Flatten input  
2. Secret regex redaction (API keys, bearer, JWT, card-like, private keys)  
3. JSON field redaction (`password`, `token`, …)  
4. Context key drop  
5. Max context truncation  
6. Untrusted content wrappers for prompt injection isolation  

## Consent (defaults all **false**)

- AI features enabled  
- Private-message analysis  
- Personalization  
- External provider processing  
- AI-generated suggestions  
- AI activity history  
- Product-improvement data  

Consent is versioned (`33.0.0`), auditable, revocable, enforced server-side in `assertConsentForRequest` / `ScrolithaAI.execute`.
