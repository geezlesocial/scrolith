# Post Backgrounds + Inbox Dedupe — Candidate Release Report

**Date (UTC):** 2026-07-25  
**Program:** Scrolith community text-post backgrounds + DIRECT inbox dedupe  
**Scope:** Candidate preparation and certification only (no production traffic promotion beyond preparation baseline)  
**Security release:** Untouched (`scrolith-backend-00299-waj` remains production backend; voice/video work excluded)

---

## Verdict

# CANDIDATE HELD — FIXES REQUIRED

**Reason (primary):** Human operator certification matrix (P1–P10, D1–D7, R1–R9) has **not** been completed. Engineering validation, migration, and 0% candidates are prepared; promotion to 5% is **blocked** until all human gates return PASS.

Secondary notes (non-blocking for 0% candidate, blocking for 5% until confirmed):

- Authenticated create/update styled-post probes require operator credentials (not available to automation).
- Mixed-version UX soft degradation: styled posts rendered via old backend omit `presentation` (plain text only) — safe, not a hard failure.

---

## Production baseline (unchanged during prep)

| Surface | Revision | Traffic |
|---------|----------|---------|
| Backend production | **`scrolith-backend-00299-waj`** (`sec-metrics-8e9096d1`) | **100%** |
| Backend rollback retain | **`scrolith-backend-00291-pew`** | **0%** (retained) |
| Frontend production | **`scrolith-frontend-00352-cez`** (`fe-msg-soft-open-97e0ce1c`) | **100%** |

Production traffic was **not** modified for this feature during candidate preparation.

---

## Git safety

### Branches

| Repo | Branch | Commit |
|------|--------|--------|
| Monorepo root (`C:\Projects`) | `feat/post-backgrounds-inbox-dedupe` | **`dad0ee19`** |
| Frontend submodule (`geezle`) | `feat/post-backgrounds-inbox-dedupe` | **`cccfa6db`** |

### Feature commits (exactly these two features)

1. **Frontend** `cccfa6db` — `feat(posts,messages): text backgrounds and DIRECT inbox dedupe`
2. **Monorepo** `dad0ee19` — `feat(posts,messages): community text backgrounds and inbox DIRECT dedupe`  
   (includes backend presentation + Prisma migration + `geezle` submodule pointer to `cccfa6db`)

Security release commits were **not** amended.

### Files changed (release scope only)

#### Frontend (`geezle` @ `cccfa6db`)

| File | Why |
|------|-----|
| `src/utils/postTextBackgrounds.ts` | Theme catalog, resolve/build presentation, safe fallbacks |
| `src/components/composer/PostTextBackgroundPicker.tsx` | Desktop/mobile composer theme picker (a11y pressed state) |
| `src/components/post/PostTextBackgroundBody.tsx` | Feed body render with background + text color |
| `src/components/sections/MemberHomeSection.tsx` | Desktop composer + feed integration |
| `src/mobile/home/screens/MobilePostScreen.tsx` | Mobile composer integration |
| `src/services/community.ts` | Optional `presentation` / `textBackgroundId` on create payload |
| `src/community/components/MentionHashtagTextarea.tsx` | Optional `style` for live preview colors |
| `src/services/messagingMerge.ts` | Order-independent DIRECT merge keys + selfUserId peer pairing |
| `src/services/messaging.ts` | Pass viewer userId into merge on list normalize |
| `src/messages/Messages.tsx` | Propagate selfUserId into merge/dedupe call sites |
| `src/context/MessageContext.tsx` | Propagate selfUserId into merge/dedupe call sites |
| `tests/unit/messagingMerge.selfUser.spec.ts` | Focused merge unit tests |

#### Backend / monorepo (`dad0ee19`)

| File | Why |
|------|-----|
| `geezle-backend/src/utils/postPresentation.ts` | Normalize/serialize presentation; reject unsafe CSS; media clears style |
| `geezle-backend/src/controllers/community.controller.ts` | Create/update/list serialize presentation |
| `geezle-backend/prisma/schema.prisma` | `CommunityPost.presentation Json?` |
| `geezle-backend/prisma/migrations/20260725090000_add_community_post_presentation/migration.sql` | Additive JSONB column |
| `geezle-backend/src/__tests__/postPresentation.unit.test.ts` | Focused unit tests |
| `geezle` submodule | Points to FE feature commit |

#### Explicitly **out of scope** (left uncommitted / not in feature commits)

- Voice/video controllers, ringtone assets, `metrics.ts` local security edits already on production 00299
- Mobile AAB/package version bumps
- Temporary `.tmp-*` deploy scratch, unrelated docs

---

## Migration audit

### SQL (strictly additive)

```sql
-- Safe additive: optional presentation JSON for Facebook-style text backgrounds.
ALTER TABLE "CommunityPost" ADD COLUMN IF NOT EXISTS "presentation" JSONB;
```

| Check | Result |
|-------|--------|
| Project | `scrolith-500821` |
| Database | Cloud SQL `scrolith-postgres-prod` / db `scrolith` |
| Method | `npx prisma migrate deploy` via Cloud SQL Auth Proxy `127.0.0.1:5433` |
| Pre-status | **PENDING** (column absent); **no failed migrations** in `_prisma_migrations` |
| Applied | **2026-07-25 02:57:06 UTC** — `20260725090000_add_community_post_presentation` |
| Post-status | Column `presentation` **jsonb NULL**; migration recorded finished |
| Row integrity | `CommunityPost` count **1330** before and after |
| Destructive SQL | **None** (`ADD COLUMN IF NOT EXISTS` only) |
| Rollback of column | **Do not drop** on emergency code rollback (additive retain) |
| Backup / recovery point | Automated Cloud SQL backup `1784862000000` SUCCESSFUL (window 2026-07-24); prior ON_DEMAND `1784787199855` SUCCESSFUL |

### Pre-migration runtime compatibility claim

**Not claimed.** The new backend Prisma client selects `presentation`. Candidate backend was deployed **only after** migration apply. Pre-migration compatibility against a DB without the column was **not** verified as a production runtime path.

Old production backend (`00299`) does not reference the column and continues to work with the additive column present.

---

## Engineering validation

### Backend

| Step | Result |
|------|--------|
| `npx prisma validate` | **PASS** (with dummy `DATABASE_URL` for CLI config) |
| `npx prisma generate` | **PASS** |
| `npm run build` (`tsc`) | **PASS** |
| `postPresentation.unit.test.ts` | **8/8 PASS** |

Unit coverage includes:

- plain posts without presentation → `undefined`
- valid theme id → preset colors
- unknown theme → `null`
- media attachments clear presentation
- `none` clears presentation
- unsafe `url(...)` background rejected
- serialize null for legacy posts
- serialize styled presentation fields

### Frontend

| Step | Result |
|------|--------|
| `npm run build` (Vite production) | **PASS** (~1m 21s) |
| `tests/unit/messagingMerge.selfUser.spec.ts` | **5/5 PASS** |

Merge tests prove:

- merge key deterministic + order-independent
- peer-only + full-pair collapse to one row (history preserved)
- different peers remain separate
- GROUP not merged as DIRECT
- unread counts preserved on merge

### Build artifacts (Cloud Build)

| Image | Build ID | Status |
|-------|----------|--------|
| `…/scrolith-backend:pbg-inbox-dedupe-dad0ee19` | `07f6f072-a785-4be1-b87e-fd9b70dca037` | **SUCCESS** |
| `…/scrolith-frontend:fe-pbg-inbox-dedupe-cccfa6db` | `559be282-d978-4616-9283-e1196480e30f` | **SUCCESS** |

---

## Candidate deployments (0% traffic)

### Backend candidate

| Field | Value |
|-------|--------|
| Revision | **`scrolith-backend-00172-m6d`** |
| Tag | **`pbg-inbox-dedupe`** |
| URL | https://pbg-inbox-dedupe---scrolith-backend-25ysnpjdda-as.a.run.app |
| Traffic | **0%** |
| Image digest | `sha256:7758e104816c6ac3837f15d1078e957747b035b975917e57dc46609d8f565d05` |
| Runtime | Default container command (**`node dist/server.js`**) — no migrate-on-boot |
| Sidecar | `clamav` retained (container dependency) |
| Secrets | `DATABASE_URL`, `JWT_SECRET`, `FCM_SERVICE_ACCOUNT_JSON`, `VOICE_ICE_TURN_SECRET` (Secret Manager refs) |
| Plain env | **50** keys copied from `00299-waj` production-equivalent set |
| Media | `STORAGE_BUCKET=scrolith-prod-media`, `UPLOAD_DRIVER=gcs` |
| Scrolitha | `SCROLITHA_AI_ENABLED=true`, core endpoint present, Ollama provider flags present |
| CORS | Includes candidate FE origin `https://pbg-inbox-dedupe---scrolith-frontend-25ysnpjdda-as.a.run.app` |
| Metrics | Fail-closed (**unauth `/metrics` → 403**) |

### Frontend candidate

| Field | Value |
|-------|--------|
| Revision | **`scrolith-frontend-00357-hol`** |
| Tag | **`pbg-inbox-dedupe`** |
| URL | https://pbg-inbox-dedupe---scrolith-frontend-25ysnpjdda-as.a.run.app |
| Image tag | `fe-pbg-inbox-dedupe-cccfa6db` |
| API target | **Tagged BE candidate** baked into bundle (`pbg-inbox-dedupe---scrolith-backend-…` present in `index-DYhk-u2i.js`) |
| Root probe | **200** |
| Traffic | **0%** (tag-only) |
| Production FE | Remains **`00352-cez` @ 100%** |

---

## Automated candidate checks (backend)

| Check | Result |
|-------|--------|
| `/api/health` | **200 OK** |
| `/api/readyz` | **200 READY** (database ready) |
| Unauthenticated `/metrics` | **403** |
| `/api/community/posts` list | **200** (legacy posts readable; `presentation: null`) |
| `/api/auth/health` | **200** |
| Create post unauthenticated | **401** (auth required — expected) |
| CORS preflight candidate FE origin | **204** + `Access-Control-Allow-Origin` = candidate FE |
| Production `api.scrolith.com` health/posts | **200** (unchanged) |

**Not automated (require operator session):** styled post create/read/update, Socket.IO authenticated, Scrolitha chat, media upload round-trip, inbox dedupe with live duplicates.

Evidence file: `docs/evidence/pbg_inbox_candidate_auto_probes.txt`

---

## Compatibility matrix (mixed-version window)

Critical requirement: at staged rollout, some users may hit old BE while others hit new BE.

| Pairing | Behavior | Safe? |
|---------|----------|-------|
| **Old FE → Old BE** | No presentation fields; unchanged | **YES** |
| **Old FE → New BE** | Body has no presentation; new BE leaves column null; lists serialize `presentation: null` | **YES** |
| **New FE → New BE** (post-migration) | Optional `presentation` / `textBackgroundId` normalized; media clears style | **YES** |
| **New FE → Old BE** | Extra body fields (`presentation`, `textBackgroundId`) are **not written** by old controller (explicit field map only — not passed into Prisma create). Create succeeds; style **silently ignored** until user hits new BE | **YES (soft degrade)** |

### Independent FE/BE percentage splits?

**Allowed after migration**, with this contract:

1. Migration already applied (done).
2. New FE may send optional presentation payload; old BE ignores it without 4xx/5xx.
3. New BE accepts optional presentation; old FE never sends it.
4. During mixed BE traffic, a styled post may render plain when a read is served by old BE (old serializer omits presentation). **Not a hard failure.**

**No coordinated hard cutover required** for correctness. Coordinated FE+BE promote still recommended for **consistent styling UX**, but independent 5% BE with tag-only FE candidate is the safer first step.

### Inbox dedupe

Client-side only (`mergeDirectConversations` + `selfUserId`). Works against both old and new backends. No API contract change. **Independent of BE revision.**

---

## Human certification matrix

Operator must return **PASS** or **FAIL** for every gate. **Not started in this automated session.**

### Post backgrounds

| Gate | Description | Result |
|------|-------------|--------|
| P1 | Desktop picker visible | **PENDING** |
| P2 | Mobile picker visible | **PENDING** |
| P3 | Selected theme previews correctly | **PENDING** |
| P4 | Styled text post publishes | **PENDING** |
| P5 | Styling persists after refresh | **PENDING** |
| P6 | Feed renders readable text + correct background | **PENDING** |
| P7 | Media attachment clears background | **PENDING** |
| P8 | Plain post remains unchanged | **PENDING** |
| P9 | Existing legacy posts unchanged | **PENDING** |
| P10 | Long text usable; layout not corrupted | **PENDING** |

### Inbox deduplication

| Gate | Description | Result |
|------|-------------|--------|
| D1 | Same peer appears once | **PENDING** |
| D2 | Existing message history present | **PENDING** |
| D3 | New message sends successfully | **PENDING** |
| D4 | Incoming message same conversation | **PENDING** |
| D5 | Unread state correct | **PENDING** |
| D6 | Different peers separate | **PENDING** |
| D7 | Group conversations separate | **PENDING** |

### Regression

| Gate | Description | Result |
|------|-------------|--------|
| R1 | Login | **PENDING** |
| R2 | Logout | **PENDING** |
| R3 | Feed loads | **PENDING** |
| R4 | Comments and reactions | **PENDING** |
| R5 | Media upload and retrieval | **PENDING** |
| R6 | Notifications | **PENDING** |
| R7 | Socket.IO healthy | **PENDING** |
| R8 | Scrolitha operational | **PENDING** |
| R9 | `/metrics` remains 403 | **PENDING** (automation: **PASS** on candidate) |

**Do not authorize production traffic until all required gates PASS.**

---

## Traffic status

| Surface | Now |
|---------|-----|
| Backend prod | `00299-waj` **100%** |
| Backend candidate | `00172-m6d` **0%** tag `pbg-inbox-dedupe` |
| Frontend prod | `00352-cez` **100%** |
| Frontend candidate | `00357-hol` tag `pbg-inbox-dedupe` @ **0%** |

**5% promotion: NOT executed in this task** (held for human certification).

### If later certified — only promote

```text
new backend candidate = 5%
scrolith-backend-00299-waj = 95%
```

Matching frontend revision only via established FE rollout method. Do not point production FE at incompatible BE split without the compatibility matrix above.

---

## Monitoring evidence (prep window)

| Signal | Observation |
|--------|-------------|
| Candidate health | OK |
| Candidate readiness | READY |
| Candidate metrics | 403 unauth |
| Prod health/posts | 200 during candidate deploy |
| Post-create failures (prod) | No candidate traffic on prod percentage path |
| Prisma/migration | Clean status after deploy |

Full 30-minute 5% observation **not started** (no 5% promote).

---

## Rollback readiness

| Action | Command / approach |
|--------|--------------------|
| Backend traffic | `gcloud run services update-traffic scrolith-backend --region=asia-southeast1 --to-revisions=scrolith-backend-00299-waj=100` |
| Frontend traffic | restore `scrolith-frontend-00352-cez=100` |
| Database column | **Retain** `presentation` JSONB — do not drop |
| Candidate retain | Keep tag `pbg-inbox-dedupe` for diagnosis |

---

## Unresolved risks

1. **Human gates incomplete** — blocks 5% certification.
2. **Authenticated E2E not automated** — styled post write path not exercised against candidate with a real session.
3. **Soft style loss on old BE reads** during mixed BE % — UX inconsistency only.
4. **Revision naming** — candidate revision id `00172-m6d` is lower than `00299` due to Cloud Run generation quirks; traffic tags are authoritative.
5. Local uncommitted voice/video and mobile work remains outside this branch scope (preserved, not discarded).

---

## Operator next steps

1. Open FE candidate tag URL (after deploy) and confirm API points to BE tag `pbg-inbox-dedupe`.
2. Complete human matrix P/D/R with PASS/FAIL.
3. If all PASS, request: **CANDIDATE CERTIFIED FOR 5% STAGED ROLLOUT** and apply only 5% BE + matching FE method.
4. Observe ≥30 minutes; rollback to `00299-waj` / `00352-cez` on material regression.

---

## Appendix — deterministic DIRECT merge key

Normalized form (order-independent):

```text
direct:{min(self,peer)}:{max(self,peer)}
```

`selfUserId` upgrades peer-only participant lists so dual server rows for the same peer collapse. GROUP types never receive DIRECT keys. Empty keys pass through (no silent discard of non-mergeable rows beyond existing passthrough behavior).
