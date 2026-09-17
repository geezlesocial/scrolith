# Scrolith Threat Model

## Scope and trust boundaries

```text
Browser / mobile WebView
        |
        | HTTPS, CORS, auth/session
        v
Azure Container Apps API  ---- Redis / queues / realtime
        |                         |
        +---- PostgreSQL          +---- Ollama / AI providers
        +---- Blob/GCS/CDN        +---- Email / push / payment providers
```

External users, uploaded media, post text, resumes, URLs, webhooks, AI prompts, Socket.IO events, and OAuth responses are untrusted inputs. Authentication is not authorization; every resource decision must be made server-side.

## Threat register

| Threat | Assets | Attack path | Required control |
|---|---|---|---|
| Credential theft | JWTs, sessions, passkeys | XSS, insecure cookie, stolen device, leaked logs | CSP, secure/httpOnly cookies where applicable, token redaction, session rotation/revocation, re-authentication |
| Account takeover | User, company, wallet, payout accounts | Password abuse, OAuth confusion, session fixation | MFA/passkeys, login limits, consistent errors, session rotation, revoke-all, high-risk re-auth |
| IDOR/BOLA | Profiles, media, messages, jobs, gifts, payments | Client changes IDs or ownership fields | Server-side ownership and permission checks; cross-tenant tests |
| Abuse/DoS | API, Socket.IO, AI, media | Oversized payloads, repeated expensive requests, replica multiplication | Small payloads, distributed limits, concurrency caps, queues, circuit breakers |
| Malicious media | Storage, image/video workers, users | Polyglot files, malware, decompression bombs | Signature/MIME validation, size/dimension limits, malware scanning, isolated processing |
| SSRF | Internal services, metadata endpoints | User-controlled remote URL or webhook | Allowlist/denylist, DNS/IP validation, egress controls, timeouts |
| Prompt injection | AI tools, private context | User text instructs model to reveal data or ignore policy | Untrusted-data delimiters, tool authorization, output schemas, no secret context |
| Data leakage | Messages, resumes, KYC, payments | Logs, AI context, cache collision, signed URL misuse | Redaction, tenant keys, private-by-default storage, TTL signed URLs, consent/retention |
| Realtime impersonation | Messages, presence, calls | Forged event/user/resource IDs | JWT socket auth, event schemas, participant checks, replay/idempotency controls |
| Financial manipulation | Wallet, Dashcoin Gifts, payments | Replay, duplicate request, invalid state transition | Idempotency, atomic transactions, webhook signatures, reconciliation, immutable audit events |
| Supply-chain compromise | Runtime/container/build | Vulnerable dependency/image or leaked CI secret | Lockfile review, SCA, SAST, secret scanning, image scanning, signed immutable artifacts |
| Cloud misconfiguration | Azure, storage, databases | Excess access, public storage, stale revisions | Least privilege, private storage, scoped identities, revision cleanup, audit alerts |

## Highest-risk attack scenarios

1. A production container starts with a known JWT fallback secret.
2. An attacker sends a large Socket.IO payload repeatedly and exhausts memory.
3. A user changes a resource ID to view another user’s resume, media, message, or payment object.
4. A user submits a remote URL that causes a server-side request into internal infrastructure.
5. A payment or Dashcoin Gift request is replayed and credited twice.
6. A malicious resume/image/video reaches an unisolated parser or media worker.
7. AI context unintentionally includes private messages, KYC, resumes, or payment information.
8. Process-local limits are bypassed by distributing requests across replicas.

## Security objectives

- Confidentiality: private account, message, financial, KYC, and employer data never crosses an authorization boundary.
- Integrity: AI suggestions, financial state, permissions, and content are changed only after explicit authorized action.
- Availability: expensive AI/media work is isolated and bounded; core auth/feed/messaging remain usable when AI is down.
- Accountability: sensitive actions have redacted correlation IDs and immutable audit records.
- Privacy: personalization is opt-in, purpose-limited, deletable, and never silently trained from private data.
