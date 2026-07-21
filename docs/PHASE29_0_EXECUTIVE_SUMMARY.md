# Phase 29.0 — Enterprise Messaging Groups  
## Executive Summary

**Feature:** Enterprise Messaging Groups (pure messaging rooms — not Community Groups, Channels, Forums, or Business Pages).

**Phase 29.0 outcome:** Architecture & technical design **complete**. No production deployment. No schema applied yet.

### Strategic approach

Scrolith already ships **Phase 22.2 group messaging** on the same tables as Direct Messages (`Conversation` type GROUP + `DirectMessage`). Phase 29 **extends** that foundation into a full enterprise product (wizard, SECRET groups, granular permissions, join policies, content policies, moderation, admin, analytics) **without** forking the message store or breaking DM.

### What we will not do

- Duplicate message tables  
- Merge Community chat into messenger  
- Auto-deploy  
- Proceed to coding Phase 29.1 until this design is accepted  

### Delivery program

| Phase | Focus |
|-------|--------|
| 29.0 | Architecture (this gate) |
| 29.1 | Database & backend foundation |
| 29.2 | Realtime messaging engine |
| 29.3 | Frontend & UX (wizard) |
| 29.4 | Admin & moderation |
| 29.5 | Security, analytics, search |
| 29.6 | Testing & certification |
| 29.7 | Deployment (only when requested) |

### Success criteria (program)

Enterprise Messaging Groups coexist with Direct Messages; zero messaging regressions; advanced permissions and moderation; realtime web + Android; enterprise audit/security; production-ready only after 29.6–29.7.

### Artifacts

- `docs/PHASE29_0_ENTERPRISE_MESSAGING_GROUPS_ARCHITECTURE.md`
- `docs/PHASE29_0_PERMISSION_MATRIX.md`
- `docs/PHASE29_0_SOCKET_AND_API_SPEC.md`
- `docs/PHASE29_0_COMPLETION_GATE.json`

### Decision required to open Phase 29.1

Stakeholder acceptance of Phase 29.0 gate status **PASS**.
