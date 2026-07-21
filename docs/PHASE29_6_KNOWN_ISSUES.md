# Phase 29.6 — Known Issues Register

| Field | Value |
|-------|--------|
| **Phase** | 29.6 |
| **Date** | 2026-07-21 |
| **knownIssuesDocumented** | **PASS** |
| **Policy** | No issue may be hidden. Severity honest. |

---

## Severity definitions

| Severity | Meaning |
|----------|---------|
| **Critical** | Production-blocking security/data loss/outage; blocks certification |
| **High** | Major functional gap or high exploitability; fix before or immediately after deploy |
| **Medium** | Meaningful limitation; workaround or post-deploy hardening acceptable |
| **Low** | Minor UX/ops friction |
| **Informational** | Context, deferred enhancements, environment limits |

---

## Critical

**None.**

No critical defects were found during Phase 29.6 certification. Program is not blocked.

---

## High

**None open at certification close.**

| ID | Title | Notes |
|----|-------|-------|
| — | — | All high-severity harness failures (e.g. Jest 22.1 discovery) were fixed as corrective patches in 29.6 |

---

## Medium

| ID | Area | Description | Mitigation / plan |
|----|------|-------------|-------------------|
| KI-M1 | Multi-instance limits | Abuse flood buckets, typing rate maps, and recent-search history are **in-process**. Multi-replica Cloud Run does not share counters. | Soft limits remain useful per instance; consider Redis-backed rate limits post-29.7 if abuse observed |
| KI-M2 | Search scale | PostgreSQL full-text / trigram **not** enabled. Search uses contains + fuzzy score. Large catalogs may slow. | 29.5 additive indexes help time-range; FTS is future hardening |
| KI-M3 | Migrations unapplied | 29.1 + 29.5 migrations exist but are **not** applied to production until 29.7. SECRET/columns/indexes unavailable in prod until then. | Expected; apply in migration order in release readiness |
| KI-M4 | External load lab | 1k–10k concurrent real users / 24h soak **not** executed against Cloud Run in 29.6. | Post-deploy monitoring + optional load lab in 29.7 |
| KI-M5 | Fan-out cost | Message emit reloads active members from DB (security over pure room trust). Very large groups increase emit latency. | Monitor p95; cache member sets carefully only with invalidation |
| KI-M6 | E2E / device lab | Full Playwright matrix and physical multi-device lab not re-run in 29.6 environment. | Android/web contracts + unit; device smoke in 29.7 |

---

## Low

| ID | Area | Description | Mitigation / plan |
|----|------|-------------|-------------------|
| KI-L1 | Health unit DB noise | `phase295` health path logs Prisma `DATABASE_URL` missing when run without DB; test still PASS. | Optional mock prisma in unit env |
| KI-L2 | ts-jest config warning | Deprecated `globals` ts-jest config warning during Jest. | Non-blocking; cleanup later |
| KI-L3 | Vitest path mismatch | Some FE suites are `node:test` and fail under default Vitest include. | Documented runner: `npx tsx --test ...` |
| KI-L4 | Formal a11y lab | axe/screen-reader full pass not re-executed in 29.6. | Prior a11y gates + structure; 29.7 smoke |
| KI-L5 | Admin role naming | Platform admin helpers depend on existing role strings (`admin` / elevated). | Align with SUPER_ADMIN if product renames roles |
| KI-L6 | Ephemeral multi-typer TTL | Typing map growth under extreme churn depends on clear paths. | Rate limits + disconnect clear; monitor memory |

---

## Informational

| ID | Area | Description |
|----|------|-------------|
| KI-I1 | SECRET enum permanence | Once applied, PostgreSQL enum values are not easily removed. Rollback of app code leaves unused enum value (safe). |
| KI-I2 | Community Groups vs Messaging Groups | Enterprise **Messaging** Groups (`Conversation.type=GROUP`) remain distinct from CommunityClub groups. Do not conflate admin UIs. |
| KI-I3 | No deploy in 29.6 | Certification artifacts only; production unchanged. |
| KI-I4 | Phase 29.7 gate | Production deployment requires explicit authorization. |
| KI-I5 | Message email policy | Offline + once/day email policy coexists; certified via `messageEmailPolicy` suite. |
| KI-I6 | Feature flag optional | Advanced enterprise create paths may use flags; core GROUP 22.2 remains available. |
| KI-I7 | Prior residual from 29.5 | Saved/recent searches not multi-instance durable (carried forward as KI-M1). |

---

## Corrective patches applied during 29.6

| Patch | Severity addressed | Description |
|-------|--------------------|-------------|
| phase221 → Jest | High (cert gate) | Converted dual node:test harness so Jest certification runner discovers tests |
| phase296 cert suite | — | New security/load/inventory certification harness |

---

## Issue count summary

| Severity | Open count |
|----------|------------|
| Critical | 0 |
| High | 0 |
| Medium | 6 |
| Low | 6 |
| Informational | 7 |

---

## Certification impact

Open medium items are **accepted residual risks** for staged production under Phase 29.7. They do not constitute critical regressions or authorization bypasses. No issue was suppressed from this register.
