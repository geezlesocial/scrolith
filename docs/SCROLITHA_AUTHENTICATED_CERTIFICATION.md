# Scrolitha Authenticated Certification

**Date:** 2026-07-22
**Final backend:** `scrolith-backend-p3334-ollama4` at 100%
**Method:** Redacted server-side admin cohort certification using a short-lived in-process JWT. Tokens, cookies, user IDs, and private content were not recorded.

## Gates

| Gate | Result |
|---|---|
| Admin identity resolved | PASS |
| Beta allowlist and `betaAllowlistOnly=true` | PASS |
| AI consent and suggestions consent | PASS |
| Private-message analysis consent | PASS |
| Master/platform/assistant/composer flags | PASS |
| OLLAMA only, external disabled, MOCK prohibited | PASS |

## Candidate `p3334-ollama4`

| Prompt | Status | Provider/model | Skill |
|---|---:|---|---|
| Find jobs for me | 200 | OLLAMA / qwen3:14b | JobSkill |
| Improve my resume | 200 | OLLAMA / qwen3:14b | JobSkill |
| Review my profile | 200 | OLLAMA / qwen3:14b | ResumeSkill |
| Find freelancers | 200 | OLLAMA / qwen3:14b | SearchSkill |
| Create a proposal draft | 200 | OLLAMA / qwen3:14b | SearchSkill |
| Write a post | 200 | OLLAMA / qwen3:14b | SearchSkill |

## Production

- `/api/ai/copilot/status`: 200, OLLAMA, qwen3:14b, consent and allowlist passed.
- `Find jobs for me`: 200, JobSkill, OLLAMA / qwen3:14b.
- `Write a post`: 200, OLLAMA / qwen3:14b.
- `Create a proposal draft`: 200, OLLAMA / qwen3:14b.
- `/assistant` and Scrolitha Messages surfaces certified through the Copilot path.
- AI disclosure remained visible; no auto-send, auto-publish, or auto-apply actions occurred.
- `push_token_project_reset`: 200.
- Malformed tracking: one controlled 400; no retry flood.

## Evidence

- `docs/evidence/scrolitha_hotfix_authenticated_preflight.json`
- `docs/evidence/scrolitha_authenticated_copilot_evidence.json`
- `docs/evidence/scrolitha_authenticated_production_copilot.json`
- `docs/evidence/scrolitha_tracking_certification.json`
- `docs/evidence/scrolitha_hotfix_monitoring_window.json`
