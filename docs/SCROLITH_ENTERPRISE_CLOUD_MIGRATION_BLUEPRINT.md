# Scrolith Enterprise Cloud Migration Blueprint

**Document type:** Enterprise engineering blueprint (architecture, operations, security, FinOps)  
**Audience:** Principal architects, SRE, DevOps, security, platform, mobile, database teams  
**Classification:** Internal — production infrastructure planning  
**Platform:** Scrolith multi-surface SaaS (social, professional, communities, Scroll, stories, messaging, jobs, gigs, marketplace, Scrolitha AI, notifications, OAuth, Android, translation, recommendations, admin, analytics, media, payments, APIs)  
**Current cloud (verified inventory snapshot):** Google Cloud Platform project `scrolith-500821`, primary region `asia-southeast1`  
**Document date:** 2026-07-20  
**Status:** Planning blueprint — **not** an authorization to execute cutover  

---

### Document conventions

| Marker | Meaning |
|--------|---------|
| **FACT** | Observed from live GCP inventory, repository conventions, or certified production phases |
| **ASSUMPTION** | Must be confirmed during Discovery; do not treat as inventory |
| **RECOMMENDATION** | Opinion grounded in architecture and tradeoffs |
| **WHY / HOW / RISKS / VALIDATION / ROLLBACK** | Required section structure for operational content |

**Non-goals of this document**

- Does not authorize production cutover without executive + security + SRE sign-off  
- Does not replace runbooks for day-2 operations of the *current* estate  
- Does not recommend shortcuts that risk data loss, JWT/OAuth breakage, feed identity regression, or Android push breakage  

**Success definition**

After migration (if executed), every listed surface works **as before** for real users: code, Git history, database, media, secrets, DNS, TLS, APIs, Cloud Run-equivalent compute, auth/OAuth, Firebase/FCM, Android, notifications, AI, monitoring, CI/CD, permissions, and security posture — with **zero unplanned data loss** and **minimal controlled downtime**.

---

## Executive summary

Scrolith today is a **containerized, multi-service SaaS on Google Cloud Run**, with **PostgreSQL 16 on Cloud SQL**, **object storage on GCS**, **secrets in Secret Manager**, **images in Artifact Registry**, **builds via Cloud Build**, **domains on scrolith.com / api.scrolith.com**, **Capacitor Android** with **FCM**, and a **monorepo + geezle frontend submodule** delivery model.

### Live inventory snapshot (FACT — gcloud, 2026-07-20)

| Layer | Resource | Notes |
|-------|----------|--------|
| Project | `scrolith-500821` | Production project |
| Region | `asia-southeast1` | Primary compute/data region |
| Cloud Run | `scrolith-frontend` | Latest ready e.g. `scrolith-frontend-00227-xud` |
| Cloud Run | `scrolith-backend` | Latest ready e.g. `scrolith-backend-00164-vax` |
| Cloud Run | `scrolith-media-worker` | Media pipeline |
| Cloud Run | `scrolitha-core` | AI core service |
| Cloud Run | `scrolith-clamav` | Malware scanning |
| Cloud SQL | `scrolith-postgres-prod` | `POSTGRES_16`, tier `db-custom-1-3840` |
| Artifact Registry | `asia-southeast1` / `scrolith` | Docker format |
| Secret Manager (sample) | `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_API_KEY` | Full secret set larger — complete inventory required |
| GCS (sample) | `scrolith-prod-media`, `scrolith-prod-kyc-private`, `downloads.scrolith.com`, `scrolith-500821_cloudbuild` | Media + KYC + downloads + build |

### Strategic recommendation (preview of Part 25)

| Option | Recommendation rank | Rationale (summary) |
|--------|---------------------|---------------------|
| **GCP project → GCP project (same architecture)** | **Primary / safest** | Lowest rewrite cost; preserves Cloud Run, Cloud SQL, GCS, Secret Manager, Cloud Build, FCM adjacency |
| Remain on current GCP project with hardening | Operational default if “migration” is only DR/account isolation | Often better than multi-cloud rewrite |
| GCP → AWS | Only with multi-year platform investment | Largest service mapping work (Run→ECS/Fargate/App Runner, SQL→RDS, GCS→S3) |
| GCP → Azure | Only with multi-year platform investment | Similar mapping (Container Apps/AKS, Flexible Server, Blob) |

**RECOMMENDATION:** Prefer **account/project isolation or multi-region on GCP** over a full hyperscaler rewrite unless there is a binding commercial, compliance, or multi-cloud mandate. If a mandate exists, treat migration as a **program** (quarters), not a project (weeks).

---

# PART 1 — Current Architecture Discovery

## 1.1 Why

Discovery prevents silent dependency loss: OAuth redirect URIs, FCM package fingerprints, Prisma extensions, media worker queues, KYC private buckets, Scrolitha runtime, ClamAV, and tagged Cloud Run traffic are easy to miss and catastrophic if omitted.

## 1.2 How — inventory playbook

### 1.2.1 Source control (FACT + process)

| Item | How to inventory |
|------|------------------|
| Monorepo | `C:\Projects` — branches e.g. `release/backend-production` |
| Frontend submodule | `geezle/` → GitHub `geezlesocial/scrolith` `main` |
| Backend path | `geezle-backend/` |
| Mobile | `mobile/` Capacitor Android/iOS |
| Deploy assets | `deploy/docker/*`, `deploy/nginx/*`, `deploy/scrolitha-core-engine/*` |
| History | `git log --all`, tags, release phase docs under `docs/PHASE*` |
| Remotes | `git remote -v` on monorepo + geezle |

**Commands (non-destructive):**

```bash
# Monorepo
git -C C:/Projects remote -v
git -C C:/Projects branch -a
git -C C:/Projects submodule status

# Frontend
git -C C:/Projects/geezle remote -v
git -C C:/Projects/geezle log -5 --oneline

# Map phase certification docs
find C:/Projects/docs -name 'PHASE*.md' | sort
```

### 1.2.2 Runtime compute — Cloud Run (FACT method)

```bash
gcloud config set project scrolith-500821
gcloud run services list --region=asia-southeast1
gcloud run services describe scrolith-backend --region=asia-southeast1 --format=export > inventory/run-backend.yaml
gcloud run services describe scrolith-frontend --region=asia-southeast1 --format=export > inventory/run-frontend.yaml
gcloud run services describe scrolith-media-worker --region=asia-southeast1 --format=export > inventory/run-media-worker.yaml
gcloud run services describe scrolitha-core --region=asia-southeast1 --format=export > inventory/run-scrolitha-core.yaml
gcloud run services describe scrolith-clamav --region=asia-southeast1 --format=export > inventory/run-clamav.yaml
gcloud run revisions list --service=scrolith-backend --region=asia-southeast1 --limit=50
gcloud run services get-iam-policy scrolith-backend --region=asia-southeast1
```

**Capture per service:** image digests, CPU/memory, concurrency, min/max instances, env vars (names only in docs), secrets mounts, VPC connectors, service accounts, traffic tags (e.g. `p26`, `p26c`, `p26c-logo`), custom domains.

### 1.2.3 Data — Cloud SQL PostgreSQL

```bash
gcloud sql instances describe scrolith-postgres-prod
gcloud sql databases list --instance=scrolith-postgres-prod
gcloud sql users list --instance=scrolith-postgres-prod
gcloud sql backups list --instance=scrolith-postgres-prod
```

**Prisma:** inventory migrations under `geezle-backend/prisma/migrations` (or equivalent).  
**ASSUMPTION:** Exact DB name, HA/replica topology, and PITR window must be confirmed from `gcloud sql instances describe`.

### 1.2.4 Object storage — GCS

```bash
gcloud storage buckets list --project=scrolith-500821
gcloud storage buckets describe gs://scrolith-prod-media
gcloud storage buckets describe gs://scrolith-prod-kyc-private
# Lifecycle, CORS, IAM, encryption, public access prevention
```

### 1.2.5 Secrets

```bash
gcloud secrets list --project="${GCP_PROJECT_ID}"
# For each secret: versions, IAM accessors — never print values
gcloud secrets get-iam-policy JWT_SECRET
```

### 1.2.6 IAM & service accounts

```bash
gcloud projects get-iam-policy scrolith-500821
gcloud iam service-accounts list
# Per SA: keys (prefer workload identity over user keys), roles
```

### 1.2.7 Artifact Registry & Cloud Build

```bash
gcloud artifacts repositories list --location=asia-southeast1
gcloud artifacts docker images list \
  asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith --include-tags --limit=100
gcloud builds list --limit=50
# Export cloudbuild yaml from geezle/cloudbuild.* and monorepo scripts
```

### 1.2.8 Networking, DNS, TLS

```bash
gcloud dns managed-zones list
gcloud certificate-manager certificates list  # if used
gcloud compute ssl-certificates list
gcloud compute url-maps list
gcloud compute backend-services list
gcloud compute addresses list
# Cloud Run domain mappings
gcloud beta run domain-mappings list --region=asia-southeast1
```

**Public hostnames (FACT from production usage):** `scrolith.com`, `www.scrolith.com`, `api.scrolith.com`, Cloud Run default hosts `*-25ysnpjdda-as.a.run.app`.

### 1.2.9 Firebase / FCM / Android

| Asset | Inventory action |
|-------|------------------|
| `google-services.json` | Present under `mobile/android/app/` — store checksum; never commit extra copies |
| Package | `com.scrolith.scrolith` |
| Channels | `notificationTaxonomy.ts` / `notificationAndroidChannels.ts` |
| Play signing | Upload key + Play App Signing cert fingerprints |
| Deep links | AndroidManifest intent filters for `https://scrolith.com` |

### 1.2.10 OAuth

| Provider | Inventory |
|----------|-----------|
| Google | Cloud Console OAuth client IDs, authorized redirect URIs (`api.scrolith.com` callback), Web client origins (`scrolith.com`) |
| LinkedIn | Developer app redirect URIs |
| Backend env | `FRONTEND_URL`, `CLIENT_URL`, `JWT_SECRET`, exchange token store (PasswordResetToken / oauth-exchange) |

**FACT (Phase 25B/C):** Missing `FRONTEND_URL` previously caused localhost redirects — migration must treat OAuth env as **critical path**.

### 1.2.11 Observability

```bash
gcloud logging sinks list
gcloud monitoring dashboards list
gcloud alpha monitoring policies list
gcloud logging metrics list
```

### 1.2.12 Scheduler / Pub/Sub / other (ASSUMPTION until listed)

```bash
gcloud scheduler jobs list --location=asia-southeast1
gcloud pubsub topics list
gcloud pubsub subscriptions list
gcloud tasks queues list --location=asia-southeast1
```

Document **empty result sets** explicitly (“none found”) so silence is not mistaken for “not checked.”

### 1.2.13 Application surfaces map (product)

| Surface | Primary code | Runtime dependency |
|---------|--------------|-------------------|
| Member feed / Phase 21 identity | geezle feed utils | backend + DB |
| Messaging / privacy 22.3C | messaging services | backend + sockets + DB |
| Scroll Phase 23 | scroll FE + BE | media + DB |
| Community Phase 24 | community FE + BE | DB + media |
| Android push Phase 25–27 | mobile + FCM + BE | Firebase project |
| OAuth 25B/C | oauth controller + FE callback | FRONTEND_URL + secrets |
| Multilingual 26/26A | language services | DB columns + catalog |
| Follow onboarding 26B/C | FollowOnboarding FE | auth + follow + prefs APIs |
| Scrolitha | scrolitha-core + FE | model runtime + secrets |
| Media | media-worker + GCS | clamav, buckets |
| Payments | Stripe etc. | secrets + webhooks |

## 1.3 Risks of incomplete discovery

| Risk | Impact |
|------|--------|
| Missed private KYC bucket | Compliance breach / broken KYC |
| Missed media-worker | Scroll/story/marketplace media stuck |
| Missed ClamAV | Upload policy gap |
| Missed OAuth env | Login broken / localhost redirects |
| Missed FCM project binding | Android push dead |
| Missed tagged revisions traffic model | Broken canary process |

## 1.4 Validation

- Inventory spreadsheet with **owner, environment, criticality, dependency IDs**  
- Every Cloud Run service has exported YAML + image digest  
- Every secret **name** listed with accessor SA  
- DNS zone export matches production resolution (`dig scrolith.com`, `dig api.scrolith.com`)  

## 1.5 Rollback (discovery phase)

Discovery is read-only. Rollback = none required. **Do not** change production during discovery without change control.

---

# PART 2 — Dependency Mapping

## 2.1 Why

Cutover order is the inverse of dependency: data plane first in parallel, control plane last; traffic only after dependents are green.

## 2.2 Logical dependency graph

```
                    ┌─────────────────────┐
                    │  Users / Browsers   │
                    │  Android WebView    │
                    └──────────┬──────────┘
                               │ HTTPS
              ┌────────────────┼────────────────┐
              v                                 v
     ┌────────────────┐               ┌─────────────────┐
     │ scrolith.com   │               │ api.scrolith.com│
     │ Cloud Run FE   │───XHR/WS─────▶│ Cloud Run BE    │
     └───────┬────────┘               └────────┬────────┘
             │ assets                          │
             v                                 │
     ┌────────────────┐      ┌─────────────────┼──────────────────┐
     │ GCS / CDN /    │      │                 │                  │
     │ static assets  │      v                 v                  v
     └────────────────┘ ┌──────────┐    ┌────────────┐    ┌─────────────┐
                        │Cloud SQL │    │ GCS media  │    │Secret Mgr   │
                        │Postgres  │    │ KYC bucket │    │JWT/DB/OAuth │
                        └──────────┘    └─────▲──────┘    └─────────────┘
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        │                     │                     │
                        v                     v                     v
               ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
               │ media-worker   │    │ scrolitha-core │    │ clamav         │
               └────────────────┘    └────────────────┘    └────────────────┘
                        │
                        v
               ┌────────────────┐    ┌────────────────┐
               │ Firebase FCM   │◀───│ Android app    │
               │ (push)         │    │ com.scrolith…  │
               └────────────────┘    └────────────────┘
                        ▲
                        │ device tokens in DB
               ┌────────┴───────┐
               │ OAuth IdPs     │
               │ Google/LinkedIn│
               └────────────────┘
```

## 2.3 Critical dependency chains

| Chain | Failure mode if broken |
|-------|------------------------|
| FE → BE → Cloud SQL | Total outage |
| BE → GCS signed URLs | Avatars/media 404 |
| BE → Secret Manager | Boot failure / auth failure |
| BE → FCM credentials | Push silent failure |
| BE → FRONTEND_URL | OAuth localhost disaster (known historical) |
| FE → OAuth exchange API | Login hang after provider |
| media-worker → GCS + ClamAV | Upload pipeline stall |
| scrolitha-core → BE/FE policy | AI degraded |
| Android → scrolith.com hostname | Blank WebView / CORS |
| DNS → cert → LB/Run mapping | Trust failures |

## 2.4 How to ensure nothing is forgotten

1. **Resource graph export** (Asset Inventory / Cloud Asset API).  
2. **Runtime traffic graph** (Cloud Trace + access logs 7 days).  
3. **Env var reference graph** (every `process.env` / `VITE_*` / Cloud Run env).  
4. **Code import graph** for services calling external APIs.  
5. **Product matrix** sign-off (feed, messages, scroll, community, jobs, gigs, marketplace, admin, wallet, KYC, push, OAuth).  
6. **“Empty inventory” rule:** every category gets a row even if count=0.

## 2.5 Risks / validation / rollback

| | |
|--|--|
| **RISKS** | Hidden side services; manual GCP console resources not in git |
| **VALIDATION** | Dependency matrix reviewed by FE, BE, mobile, security owners |
| **ROLLBACK** | N/A (documentation only) |

---

# PART 3 — Risk Assessment

| ID | Risk | Prob. | Impact | Class | Mitigation | Rollback |
|----|------|-------|--------|-------|------------|----------|
| R1 | Data loss during DB cutover | L | Critical | **High** | Logical replication + checksums + PITR + dual-write freeze window | Promote old primary; DNS back |
| R2 | Media object incomplete copy | M | High | **High** | `gcloud storage rsync` + CRC32C inventory | Serve old bucket; dual-read |
| R3 | OAuth redirect misconfig | M | Critical | **High** | Parallel IdP clients; staged URIs; 25C exchange tests | Revert env; old revision |
| R4 | JWT secret rotation mid-flight | L | High | **High** | Dual validation period | Keep old secret active |
| R5 | FCM project/package mismatch | M | High | **High** | New `google-services.json` only after Play signing aligned | Old Firebase project remains |
| R6 | DNS TTL long → slow cutover | M | Med | Medium | Lower TTL 48–72h prior | Raise TTL after stable |
| R7 | Cloud Run cold start / scale | M | Med | Medium | min instances on critical services | Scale up old project |
| R8 | Secret leakage during transfer | L | Critical | **High** | No chat/email secrets; SA impersonation; audit | Rotate all transferred secrets |
| R9 | Prisma migration drift | M | High | **High** | Migration checksum lock; no auto migrate on cutover | Restore DB snapshot |
| R10 | Android deep links fail | M | Med | Medium | assetlinks.json + Play intent verification | Keep old domain serving |
| R11 | Socket/realtime breakage | M | High | **High** | Explicit WS/SSE endpoint inventory | Traffic back to old API |
| R12 | Cost overrun dual-run | H | Med | Medium | Dual-run budget + kill criteria | Decommission new after abort |
| R13 | Region latency change | M | Med | Medium | Keep asia-southeast1 or multi-region | Geo-DNS revert |
| R14 | Compliance (KYC private) | L | Critical | **High** | Private buckets, CMEK, access logs | Keep private bucket unmoved until certified |
| R15 | Incomplete service list | M | Critical | **High** | Asset Inventory + ClamAV/media-worker/scrolitha | Halt cutover |

**Risk policy:** Any **High** residual risk requires written acceptance from Engineering + Security + Product before cutover.

---

# PART 4 — Migration Strategy Comparison

## 4.1 Options

| Strategy | Description |
|----------|-------------|
| **A. GCP → GCP (new project/account)** | Rebuild same services in new GCP project; change DNS at end |
| **B. Stay GCP, harden / multi-region** | Not a vendor move; DR and isolation |
| **C. GCP → Azure** | Map services to Azure equivalents |
| **D. GCP → AWS** | Map services to AWS equivalents |

## 4.2 Service mapping

| Capability | GCP (current) | Azure | AWS |
|------------|---------------|-------|-----|
| Containers HTTP | Cloud Run | Container Apps / AKS | ECS Fargate / App Runner / EKS |
| Postgres | Cloud SQL | Azure Database for PostgreSQL Flexible | RDS / Aurora PostgreSQL |
| Object storage | GCS | Blob Storage | S3 |
| Secrets | Secret Manager | Key Vault | Secrets Manager |
| CI build | Cloud Build | Azure DevOps / GH Actions | CodeBuild / GH Actions |
| Registry | Artifact Registry | ACR | ECR |
| DNS | Cloud DNS | Azure DNS | Route 53 |
| CDN | Cloud CDN / Run | Front Door / CDN | CloudFront |
| Push | FCM | FCM still (cross-cloud) | FCM still |
| IAM | GCP IAM | Entra ID + RBAC | IAM |

## 4.3 Comparison matrix

| Dimension | GCP→GCP | GCP→Azure | GCP→AWS |
|-----------|---------|-----------|---------|
| Difficulty | **Low–Med** | **High** | **High** |
| Cost of program | Lowest | High | High |
| Expected downtime (well-run) | Minutes (DNS) | Hours–days risk | Hours–days risk |
| Architecture rewrite | Minimal | Significant | Significant |
| Networking complexity | Low | Med–High | Med–High |
| Managed service fit | Native | Good | Good |
| Ops continuity | Best | Retrain | Retrain |
| Vendor lock-in change | Same vendor, new account | Diversifies | Diversifies |
| FCM / Google OAuth friction | Lowest | Higher (still Google IdP) | Higher |
| Long-term maintenance | Same tools | New toolchains | New toolchains |
| Dual-run cost period | Weeks | Months | Months |

## 4.4 Recommendation

**Safest executable migration for Scrolith’s architecture: Strategy A (GCP project/account migration)** or **Strategy B (harden in place)** if the goal is resilience rather than vendor change.

**RECOMMENDATION against full Azure/AWS cutover as first move** unless mandated: Scrolith’s delivery model (Cloud Run + Cloud Build YAML + Artifact Registry tags + FCM + Google OAuth) is optimized for GCP. A hyperscaler move is a **platform rewrite program**.

---

# PART 5 — Migration Phases

> Each phase: Goals · Prerequisites · Tasks · Validation · Rollback

### Phase 1 — Program setup & governance

- **Goals:** RACI, change freeze calendar, success metrics, dual-run budget.  
- **Prerequisites:** Executive sponsor; security lead; SRE lead.  
- **Tasks:** Charter; risk register (Part 3); communication plan; war-room roster.  
- **Validation:** Signed charter; freeze windows published.  
- **Rollback:** Cancel program; no prod changes.

### Phase 2 — Discovery inventory (Part 1)

- **Goals:** Complete resource inventory.  
- **Prerequisites:** Read-only IAM on production project.  
- **Tasks:** Run all inventory commands; store under `docs/migration/inventory/` (no secrets).  
- **Validation:** Checklist 100% categories completed including empties.  
- **Rollback:** N/A.

### Phase 3 — Dependency & blast-radius mapping (Part 2)

- **Goals:** Ordered cutover plan.  
- **Tasks:** Graphs; critical path; product owner sign-off.  
- **Validation:** Tabletop walkthrough of failure modes.  
- **Rollback:** N/A.

### Phase 4 — Backups & restore drills

- **Goals:** Prove restore before any write path changes.  
- **Tasks:** Cloud SQL on-demand backup; export; GCS inventory; secret name export; git mirror; image digest pin.  
- **Validation:** Restore SQL to **isolated** instance; app boot against restore (non-prod).  
- **Rollback:** N/A for prod; discard drill env.

### Phase 5 — Target foundation (landing zone)

- **Goals:** Empty but production-ready target project/account.  
- **Tasks:** Org policies; folders; billing; baselined IAM; networking; logging sinks; CMEK if required.  
- **Validation:** CIS-like landing zone checklist.  
- **Rollback:** Delete unused target project.

### Phase 6 — Infrastructure as Code baseline (Part 6)

- **Goals:** Reproducible target.  
- **Tasks:** Terraform modules for Run, SQL, GCS, secrets shells, AR, IAM.  
- **Validation:** `terraform plan` clean; apply to target only.  
- **Rollback:** `terraform destroy` non-prod; never destroy prod.

### Phase 7 — Networking & private connectivity

- **Goals:** VPC, connectors, private IP SQL if used, egress.  
- **Validation:** Backend can reach SQL privately; no public SQL.  
- **Rollback:** Tear target VPC only.

### Phase 8 — Database migration (Part 7)

- **Goals:** Consistent Postgres in target.  
- **Tasks:** Replica or dump+restore; freeze writes for final sync; cutover.  
- **Validation:** Row counts, checksums, Prisma migrate status, smoke APIs.  
- **Rollback:** Point apps to old SQL; promote old primary.

### Phase 9 — Object storage migration (Part 8)

- **Goals:** Byte-identical media & KYC.  
- **Tasks:** Parallel rsync; continuous delta; final freeze.  
- **Validation:** Sample object CRC32C; signed URL tests.  
- **Rollback:** Env vars to old buckets.

### Phase 10 — Secrets & config (Part 9)

- **Goals:** Secrets present; **values rotated if exposed**.  
- **Tasks:** Create secrets; grant Run SAs; inject env.  
- **Validation:** Services start; health endpoints green.  
- **Rollback:** Old project secrets unchanged.

### Phase 11 — CI/CD & registries (Part 15)

- **Goals:** Build pipeline produces images into target registry.  
- **Tasks:** Cloud Build triggers or GH Actions; promote tags.  
- **Validation:** Pipeline builds FE/BE from protected branch.  
- **Rollback:** Builds remain on old project.

### Phase 12 — Parallel environment (“dark launch”)

- **Goals:** Full stack in target with **no public traffic**.  
- **Tasks:** Deploy all Run services; point to target SQL/GCS; internal hostname tests.  
- **Validation:** Full Part 19 test suite against internal URLs.  
- **Rollback:** Keep public DNS on old stack.

### Phase 13 — Identity provider & OAuth dual config (Part 14)

- **Goals:** OAuth works for both old and new during overlap.  
- **Tasks:** Add redirect URIs; dual FRONTEND_URL verification; exchange flow tests.  
- **Validation:** Google + LinkedIn signup/login e2e.  
- **Rollback:** Remove new URIs if bad; keep old.

### Phase 14 — Firebase / Android (Parts 12–13)

- **Goals:** Push + deep links on new API/web origin if changed.  
- **Tasks:** If package/domain unchanged, FCM may stay; if API host changes, update configs & re-release app (Phase 27A process).  
- **Validation:** Token register; push categories; deep links.  
- **Rollback:** Prior AAB / prior API host.

### Phase 15 — Observability (Part 16)

- **Goals:** Logs/metrics/alerts in target before traffic.  
- **Validation:** Synthetic checks fire alerts in staging.  
- **Rollback:** N/A.

### Phase 16 — Traffic cutover (Part 20)

- **Goals:** Users on new stack.  
- **Tasks:** Canary % if possible; DNS switch; monitor 30–120 minutes.  
- **Validation:** Part 22 checklist green.  
- **Rollback:** DNS + traffic back (Part 21).

### Phase 17 — Hypercare

- **Goals:** 72h elevated monitoring.  
- **Tasks:** On-call; defect burn-down; no feature deploys.  
- **Rollback:** As per severity.

### Phase 18 — Decommission old (only after hypercare)

- **Goals:** Cost control without premature deletion.  
- **Tasks:** Billing alerts; retain backups 30–90 days; disable write paths; finally delete.  
- **Validation:** Legal hold / retention satisfied.  
- **Rollback:** Re-enable old project if within retention.

---

# PART 6 — Infrastructure as Code

## 6.1 Why

Click-ops migration is non-repeatable and fails audits. IaC is mandatory for enterprise cutover.

## 6.2 Tooling comparison

| Tool | Fit for Scrolith | Notes |
|------|------------------|-------|
| **Terraform** | **Best default** | Multi-cloud; mature GCP/AWS/Azure providers |
| OpenTofu | Excellent alternative | Terraform-compatible; license control |
| Pulumi | Good if TS-first teams | Aligns with Node monorepo skills |
| Bicep | Azure-only | Only if target is Azure |
| CloudFormation | AWS-only | Only if target is AWS |

## 6.3 RECOMMENDATION

**Terraform (or OpenTofu) as system of record** for:

- Cloud Run services & IAM  
- Cloud SQL  
- GCS buckets + IAM  
- Artifact Registry  
- Secret Manager **resources** (not secret *values* in git)  
- DNS records (careful with cutover)  
- Log sinks / alert policies  

**Secret values** flow via:

- Manual bootstrap + Secret Manager versions, or  
- SOPS/age with strict key control, or  
- CI OIDC to Secret Manager  

**Never** commit `DATABASE_URL`, `JWT_SECRET`, Stripe keys, or Firebase private keys.

## 6.4 Module layout (suggested)

```
infra/
  modules/
    cloudrun-service/
    cloudsql-postgres/
    gcs-bucket/
    secret/
    artifact-registry/
  envs/
    prod-source/   # read-only data sources
    prod-target/
    staging-target/
```

## 6.5 Risks / validation / rollback

| | |
|--|--|
| **RISKS** | Drift vs console; accidental apply to wrong project |
| **VALIDATION** | Remote state + locking; required reviewers; `plan` artifacts stored |
| **ROLLBACK** | State rollback is **not** data rollback — use service traffic + DB restore |

---

# PART 7 — Database Migration

## 7.1 Why

PostgreSQL is the system of record for users, follows, feed edges, messages metadata, notifications, OAuth exchange tokens, language preferences, etc. Loss is unrecoverable brand damage.

## 7.2 FACT baseline

- Instance: `scrolith-postgres-prod`  
- Version: **POSTGRES_16**  
- Tier: `db-custom-1-3840`  
- Access: via `DATABASE_URL` secret to Cloud Run backend  

## 7.3 Strategies

| Strategy | Downtime | Complexity | When |
|----------|----------|------------|------|
| Dump/restore (`pg_dump`/`pg_restore`) | Higher | Lower | Small DB / long maintenance window |
| **Logical replication** | Near-zero | Higher | Production SaaS default |
| Cloud SQL cross-project replica | Low | Med | GCP→GCP preferred |
| Third-party CDC (DMS etc.) | Low | High | Multi-cloud |

## 7.4 Near-zero downtime pattern (RECOMMENDED for prod)

1. Create target Postgres 16 with same major version, compatible flags, extensions.  
2. Install required extensions on target **before** data (`pgcrypto`, `uuid-ossp`, `pg_trgm`, etc. — inventory from source).  
3. Initial bulk copy (dump or basebackup approach allowed by Cloud SQL).  
4. Configure **logical replication** publication/subscription for user tables.  
5. Monitor lag → 0.  
6. Application **write freeze** (maintenance page / read-only) for seconds–minutes.  
7. Final sync; promote target; switch `DATABASE_URL`.  
8. Run Prisma **migrate status** (do **not** invent migrations during cutover).  

## 7.5 Integrity checks

```sql
-- Example patterns (adapt to real schemas)
SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;
SELECT last_value FROM some_sequence;  -- all sequences
-- Application-level checksums:
-- COUNT(*) per critical table; MAX(updated_at); hash sample of primary keys
```

Validate:

- Row counts for critical tables (User, sessions/tokens, follows, messages, posts, notifications)  
- Sequences ≥ max(id)  
- Indexes exist (compare `\di`)  
- Foreign keys valid  
- Extensions installed  
- Triggers/functions present (`pg_proc`, event triggers)  
- Prisma `_prisma_migrations` table matches source  

## 7.6 Risks

| Risk | Mitigation |
|------|------------|
| Extension missing | Pre-create on target |
| Large tables lag | Tune parallel workers; schedule off-peak |
| Break replication with DDL | Schema freeze during CDC |
| Connection string SSL mode | Match `sslmode` requirements |

## 7.7 Validation

- Backend boots; `/health` or auth health 200  
- Login, follow graph, message send, feed load, notification create  
- Compare `COUNT(*)` report signed by DBA  

## 7.8 Rollback

1. Stop traffic to new backend.  
2. Restore `DATABASE_URL` to source instance.  
3. If writes occurred on target only: **do not** blindly reverse — restore from pre-cutover backup of source and accept target as discard, or reverse-CDC if prepared.  
4. **Policy:** Prefer freeze + short cutover over dual-write without conflict design.

---

# PART 8 — Storage Migration

## 8.1 Why

Avatars, Scroll videos, stories, marketplace images, community uploads, KYC documents — incomplete copy equals broken UX and compliance issues.

## 8.2 FACT buckets (sample)

| Bucket | Sensitivity |
|--------|-------------|
| `scrolith-prod-media` | High (user media) |
| `scrolith-prod-kyc-private` | **Critical / private** |
| `downloads.scrolith.com` | Public downloads |
| `scrolith-500821_cloudbuild` | Build artifacts |

## 8.3 How

1. Create target buckets with **same public/private posture**, CORS, lifecycle, CMEK.  
2. Continuous sync:

```bash
gcloud storage rsync gs://scrolith-prod-media gs://TARGET-media --recursive --delete-unmatched-destination-objects=false
# Prefer additive first; deletes only after verification policy
```

3. Inventory:

```bash
gcloud storage objects list gs://scrolith-prod-media --recursive --format=json > media-source.json
# Compare name + crc32c + size
```

4. Application dual-read (optional): new backend tries new bucket, falls back to old (complex — only if engineered).  
5. Final freeze uploads → final rsync → switch signing credentials / bucket env.

## 8.4 Checksums

- Prefer **CRC32C** (GCS native) equality per object  
- Sample **SHA-256** for critical KYC objects  
- Spot-check content-type and cache-control headers  

## 8.5 Risks / validation / rollback

| | |
|--|--|
| **RISKS** | ACL drift; public KYC leak; incomplete video multipart objects |
| **VALIDATION** | Random N objects; full inventory diff = 0 for freeze window |
| **ROLLBACK** | Revert bucket names in Secret Manager / env; keep old bucket immutable for 30+ days |

---

# PART 9 — Secrets Migration

## 9.1 Why

Secrets power auth, DB, payments, OAuth, AI, email. Leakage or mismatch = outage or breach.

## 9.2 Known secret names (FACT sample)

- `DATABASE_URL`  
- `JWT_SECRET`  
- `GOOGLE_API_KEY`  

**ASSUMPTION:** Production also uses Stripe, SMTP, Firebase admin JSON, OAuth client secrets, Ollama/AI keys, etc. Complete list from Secret Manager + Cloud Run env exports (names only in docs).

## 9.3 How — secure transfer

1. List secrets + IAM in source.  
2. Create empty secrets in target.  
3. Transfer values via:

   - Operator workstation with temporary elevated access + audit, **or**  
   - Cross-project SA with `secretmanager.versions.access` on source and `add` on target, scripted, logged  

4. **Never** paste secrets into tickets, chat, or git.  
5. Prefer **rotation** after migration for long-lived credentials (JWT may force re-login — plan UX).  
6. Cloud Run bind secrets as secret env / volume mounts matching source.

## 9.4 Categories checklist

| Category | Examples | Special handling |
|----------|----------|------------------|
| Auth | JWT_SECRET | Dual-key period if rotating |
| Data | DATABASE_URL | Point to target after DB ready |
| OAuth | Google/LinkedIn secrets | Update IdP consoles |
| Firebase | Admin SDK | Separate from Android client config |
| Payments | Stripe | Webhook endpoint URL change |
| AI | GOOGLE_API_KEY / model keys | Rate limits in new project |
| SMTP | Transactional email | SPF/DKIM domain alignment |

## 9.5 Risks / validation / rollback

| | |
|--|--|
| **RISKS** | Logging secret values; wrong project; partial set |
| **VALIDATION** | Service boot matrix; auth login; payment sandbox; FCM send |
| **ROLLBACK** | Old secrets untouched; switch Run back to old project |

---

# PART 10 — Identity & Access

## 10.1 Why

Over-privileged migration SAs are a top enterprise breach pattern.

## 10.2 How

1. Export source IAM policy.  
2. Map to least privilege in target:

   - Cloud Run runtime SA: SQL client, secret accessor (named secrets only), storage objectAdmin **only** on media buckets  
   - CI SA: push to Artifact Registry, deploy Run  
   - Humans: groups via Google Groups / workforce identity  

3. Prefer **Workload Identity Federation** for GitHub → GCP (no long-lived JSON keys).  
4. Enable audit logs: Admin Activity + Data Access for Secret Manager & Storage.  

## 10.3 Validation

- Access Transparency / audit query: no unexpected secret access  
- No user-managed keys on prod SAs  

## 10.4 Rollback

- Disable target SA keys; revoke IAM bindings  

---

# PART 11 — Networking

## 11.1 Why

Users trust `scrolith.com` / `api.scrolith.com`. Certificate or DNS errors equal global outage.

## 11.2 Components

| Component | Actions |
|-----------|---------|
| DNS | Inventory records; lower TTL 48–72h pre-cutover |
| TLS | Managed certs on Cloud Run domain mappings or LB |
| Load balancing | If custom LB/CDN exists, export URL maps |
| VPC | Serverless VPC connector for private SQL if used |
| Firewall / org policy | Restrict public SQL; restrict 0.0.0.0/0 admin |
| NAT | Controlled egress for webhooks |

## 11.3 Cutover DNS pattern

1. Stand up new services on target hostnames (e.g. temporary `api-new.` or Run URL).  
2. Validate fully.  
3. Atomic switch:

   - `api.scrolith.com` → new backend  
   - `scrolith.com` → new frontend  

4. Keep old Run services warm for rapid rollback.  

## 11.4 Risks / validation / rollback

| | |
|--|--|
| **RISKS** | TTL cache; cert provisioning delay; mixed FE/BE versions |
| **VALIDATION** | `dig`, SSL Labs/openssl s_client, browser hard refresh, Android WebView |
| **ROLLBACK** | Revert DNS A/AAAA/CNAME to previous targets within TTL strategy |

---

# PART 12 — Firebase

## 12.1 Why

Android push depends on Firebase project configuration, `google-services.json`, and backend FCM credentials — independent of Cloud Run region.

## 12.2 How

| Scenario | Action |
|----------|--------|
| **Same Firebase project** (typical for GCP→GCP) | Keep FCM; only ensure backend still has valid admin credentials in Secret Manager |
| **New Firebase project** | Create Android app `com.scrolith.scrolith`; download new `google-services.json`; re-sign/release Android; re-register all device tokens |
| SHA certificates | Register debug + Play App Signing SHA-1/256 in Firebase |

## 12.3 Validation

- Token registration API success  
- Test push each enterprise channel (Messages, Community, … Security)  
- Notification tap deep link  

## 12.4 Rollback

- Keep previous app version + previous backend FCM credentials  

---

# PART 13 — Android

## 13.1 Why

Capacitor shell uses production origin `scrolith.com` (FACT: `capacitor.config.ts` production hostname). Any origin/API drift breaks CORS, cookies, OAuth return, and push routing.

## 13.2 Checklist

| Area | Requirement |
|------|-------------|
| API URL | Production `https://api.scrolith.com/api` in built web assets |
| Web origin | `https://scrolith.com` scheme hostname |
| OAuth | Same as web; Custom Tabs / browser return |
| Push | FCM + Phase 25/27 channels (`scrolith_*_v1`) |
| Uploads | Camera/mic/file permissions unchanged |
| Deep links | `https://scrolith.com/**` intent filters; assetlinks.json |
| App Links | Domain verification on new hosting if domain moves |
| Play Console | New AAB if `google-services` or host config changes (Phase 27 AAB process) |

## 13.3 Risks / validation / rollback

| | |
|--|--|
| **RISKS** | Shipping WebView with localhost; stale service worker; wrong API |
| **VALIDATION** | Internal track install; cold start; login; push; scroll deep link |
| **ROLLBACK** | Play staged rollback / previous release track |

---

# PART 14 — OAuth

## 14.1 Why

Phase 25B/C established production requirements: provider callback on **api.scrolith.com**, completion on **scrolith.com**, one-time exchange, **no JWT in URL**, **no localhost**.

## 14.2 Migration tasks

1. Inventory Google Cloud OAuth clients and LinkedIn apps.  
2. Add **additional** authorized redirect URIs for parallel environment.  
3. Ensure backend env on target:

   - `FRONTEND_URL=https://scrolith.com`  
   - `CLIENT_URL` if used  
   - CORS allowlist includes `https://scrolith.com`  

4. Certify:

   - Google signup → exchange → session → follow-onboarding if required → feed  
   - LinkedIn same path  
   - Password login unaffected  

## 14.3 Risks / validation / rollback

| | |
|--|--|
| **RISKS** | Partial URI update; mixed FE/BE revisions |
| **VALIDATION** | Automated + manual OAuth e2e; no `localhost` in Location headers |
| **ROLLBACK** | Restore previous Cloud Run revision + IdP URI set |

---

# PART 15 — CI/CD

## 15.1 Why

Scrolith ships via Docker + Cloud Build + Artifact Registry tags (`p26`, `p26c`, etc.) and git-protected branches.

## 15.2 Current pattern (FACT)

- Frontend Dockerfiles / `cloudbuild.*-fe.submit.yaml` in `geezle`  
- Backend images to `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/...`  
- Deploy: Cloud Run revisions + traffic tags + promote to 100%  

## 15.3 Target options

| Target | CI | Registry |
|--------|----|----------|
| GCP→GCP | Cloud Build or GitHub Actions OIDC | Artifact Registry new project |
| Azure | GitHub Actions / Azure DevOps | ACR |
| AWS | GitHub Actions / CodePipeline | ECR |

## 15.4 Requirements

- Build from **approved commits only**  
- Image digest immutability  
- No secrets in build logs  
- Separate prod deploy approval  
- Preserve rollback by keeping N prior revisions  

## 15.5 Validation / rollback

- Pipeline produces deployable FE+BE from `main` / `release/backend-production`  
- Rollback = previous image digest traffic 100%  

---

# PART 16 — Monitoring

## 16.1 Why

Without observability, cutover is flying blind.

## 16.2 Minimum telemetry

| Signal | Use |
|--------|-----|
| Cloud Run 5xx / latency | Service health |
| SQL CPU / connections | Saturation |
| Error logs (backend) | Auth/OAuth/push failures |
| Uptime checks | `scrolith.com`, `api.scrolith.com/health` |
| Synthetic login | Critical path |
| FCM failure rates | Android |
| Media worker lag | Upload pipeline |
| Cert expiry | TLS |

## 16.3 Migration steps

1. Recreate dashboards/alerts in target **before** traffic.  
2. Dual-export logs during dual-run if possible.  
3. Page on-call on 5xx spike, OAuth error spike, DNS failures.  

## 16.4 Validation / rollback

- Fire test alert  
- Rollback criteria thresholds pre-agreed (Part 20)  

---

# PART 17 — Security

## 17.1 Controls checklist

| Control | Requirement |
|---------|-------------|
| Encryption in transit | TLS 1.2+ everywhere |
| Encryption at rest | Cloud SQL CMEK optional; GCS default/CMEK |
| Secrets | Secret Manager; no env in git |
| Key rotation | Documented JWT/OAuth/payment rotation runbooks |
| Audit logs | Enabled & retained |
| Backups | Encrypted; restore tested |
| OWASP ASVS | AuthN/Z, SSRF, injection, XSS via React defaults + CSP review |
| WebView | No mixed content in release (Android FACT) |
| Network | No public SQL |
| Supply chain | Image scanning; pinned base images |

## 17.2 Migration-specific security

- Temporary dual exposure of admin endpoints: **forbid**  
- Break-glass accounts logged  
- Post-migration secret rotation for anything copied through human hands  

---

# PART 18 — Performance

## 18.1 Validate before declaring success

| Metric | Method |
|--------|--------|
| API p50/p95 latency | Compare 7-day baseline vs post |
| FE TTFB / LCP | Synthetic mobile/desktop |
| DB query p95 | Cloud SQL insights |
| Media TTFB | CDN/GCS |
| Cold start | Cloud Run min instances policy |
| WebSocket stability | Messaging soak |
| Android cold start | Device lab |

## 18.2 Scaling

- Preserve concurrency and max-instance settings unless load tests say otherwise  
- Autoscaling policies documented per service  

## 18.3 Rollback trigger examples

- p95 API latency > 2× baseline for 15 minutes  
- Error rate > 1% sustained  
- Feed identity incidents  

---

# PART 19 — Testing

## 19.1 Test pyramid for cutover

| Layer | Scope |
|-------|-------|
| Unit | Taxonomy, auth redirects, feed identity helpers |
| Integration | API + DB + storage signed URLs |
| Contract | FE/BE API contracts |
| E2E | Playwright critical paths |
| Mobile | Android install, push, OAuth |
| Load | Auth + feed + messaging |
| Chaos | Kill media-worker; verify degradation |
| DR | Restore SQL backup to scratch |

## 19.2 Product matrix (must pass on target before DNS)

| Area | Tests |
|------|-------|
| Auth password | Signup/login/logout |
| OAuth Google/LinkedIn | Full exchange; no localhost; no JWT in URL |
| Feed Phase 21 | Identity stability; no duplicate seed |
| Messaging | Send/receive; privacy 22.3C |
| Scroll | `/scroll?scroll=` deep link |
| Community | Groups, posts |
| Marketplace / jobs / gigs | CRUD smoke |
| Notifications | In-app + FCM categories |
| Onboarding 26B/C | Languages + follow min rules |
| Multilingual 26 | Prefs + catalog |
| Scrolitha | Core health + sample prompt |
| Media | Upload image/video; ClamAV path |
| Admin | Authz negative tests |
| Payments | Sandbox webhook |
| Android | Cold/warm/killed push routing |

## 19.3 Exit criteria

No **Sev-1/Sev-2** open defects; all **High** risks mitigated or accepted in writing.

---

# PART 20 — Cutover

## 20.1 Patterns

| Pattern | Fit |
|---------|-----|
| **Blue/Green** | Best conceptual model: old=blue, new=green |
| **Canary** | Cloud Run traffic % if same project; harder cross-project without proxy |
| **DNS switch** | Final user cutover |
| **Rolling** | Within cluster; less relevant for dual projects |

## 20.2 Recommended cutover sequence (GCP→GCP)

1. Green stack fully validated (dark).  
2. Enable dual OAuth URIs.  
3. Lower DNS TTL (already done earlier).  
4. Maintenance window communication.  
5. DB final sync + short write freeze if needed.  
6. Switch backend `DATABASE_URL` / promote green backend.  
7. Switch API DNS → green backend.  
8. Switch web DNS → green frontend.  
9. Monitor 30–120 minutes (error rate, OAuth, push, SQL).  
10. Declare hypercare.  

## 20.3 Rollback triggers (examples)

- Auth failure rate spike  
- OAuth callback errors  
- Data corruption signals  
- Media 403/404 mass events  
- On-call judgment Sev-1  

---

# PART 21 — Rollback

## 21.1 Principles

1. **Prefer traffic rollback** over data rollback.  
2. Data rollback only from **pre-cutover backups** if green accepted writes.  
3. Every critical step pre-documents owner + command + ETA.

## 21.2 Procedures

### DNS

```bash
# Restore previous RR sets from exported zone file
# Raise monitoring; verify dig + curl -I https://scrolith.com
```

### Cloud Run traffic (same project canary)

```bash
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=PREVIOUS_REVISION=100
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=PREVIOUS_REVISION=100
```

### Database

- Point backend to source Cloud SQL.  
- If green took writes: restore source from snapshot taken at freeze; treat green DB as quarantine.

### Storage

- Point signed URL generation to source buckets.

### Secrets / OAuth

- Revert Run env to source secret versions.  
- IdP: remove broken redirect URIs.

### Android

- Play halt rollout; users on previous store version still hit scrolith.com (if DNS rolled back).

## 21.3 Rollback validation

- Login works  
- Feed loads  
- OAuth works  
- Push token register  
- No elevated 5xx  

---

# PART 22 — Post-Migration Validation Checklist

Mark each **PASS/FAIL** with evidence link.

### Platform

- [ ] All Cloud Run services healthy  
- [ ] SQL connections stable  
- [ ] GCS read/write sample  
- [ ] Secrets accessible only by intended SAs  
- [ ] TLS valid on scrolith.com & api.scrolith.com  

### Auth

- [ ] Password login  
- [ ] Google OAuth  
- [ ] LinkedIn OAuth  
- [ ] No localhost redirects  
- [ ] No JWT in query string  
- [ ] Token refresh / logout  

### Product

- [ ] Feed identity  
- [ ] Messaging + privacy  
- [ ] Scroll deep link  
- [ ] Community  
- [ ] Marketplace / jobs / gigs  
- [ ] Follow onboarding  
- [ ] Language preferences  
- [ ] Scrolitha sample  
- [ ] Admin authz  

### Mobile

- [ ] Android cold start  
- [ ] Push each major channel  
- [ ] Deep link from notification  
- [ ] Upload camera image  

### Ops

- [ ] Alerts firing correctly  
- [ ] Backups scheduled on target  
- [ ] Runbooks updated  
- [ ] On-call acknowledges ownership  

**Nothing is complete until every subsystem is PASS.**

---

# PART 23 — Operational Runbook (summary)

## 23.1 Everyday verification

```bash
curl -sI https://scrolith.com | head
curl -sI https://api.scrolith.com/api/auth/languages/catalog | head
gcloud run services describe scrolith-backend --region=asia-southeast1 --format='value(status.conditions)'
gcloud sql operations list --instance=scrolith-postgres-prod --limit=5
```

## 23.2 Emergency: auth outage

1. Check backend logs for JWT/DB errors.  
2. Verify `JWT_SECRET` / `DATABASE_URL` mounts.  
3. Rollback Run revision if deploy-related.  
4. Escalate Security if secret compromise suspected → rotate.

## 23.3 Emergency: OAuth outage

1. Capture `Location` header from `/api/auth/oauth/google`.  
2. Confirm not localhost.  
3. Confirm `FRONTEND_URL`.  
4. Rollback BE/FE pair.  

## 23.4 Emergency: push outage

1. Verify Firebase admin secret.  
2. Check device token table growth.  
3. Send test notification.  
4. Check Android channel IDs still valid.

## 23.5 Escalation

| Severity | Response |
|----------|----------|
| Sev-1 total outage | War room; rollback DNS/traffic within 15 min target |
| Sev-2 major feature | Feature flag / partial rollback |
| Sev-3 minor | Ticket; next business day |

---

# PART 24 — Documentation Deliverables

| Artifact | Location (recommended) |
|----------|------------------------|
| This blueprint | `docs/SCROLITH_ENTERPRISE_CLOUD_MIGRATION_BLUEPRINT.md` |
| Inventory exports | `docs/migration/inventory/` (git-crypt or private store for sensitive) |
| Dependency matrix | Spreadsheet + graph export |
| Risk register | Living sheet linked from charter |
| Runbooks | `docs/runbooks/` |
| Validation sheets | Phase exit checklists |
| Architecture diagrams | Text diagrams herein + redraw in draw.io/Lucid |
| Timeline | Gantt: Discovery 2–4 w; dual-run 4–12 w; cutover window 1–2 h; hypercare 72 h–2 w |

### Suggested high-level timeline (GCP→GCP)

```
Week 0-2   Discovery + backups drill
Week 2-4   Landing zone + Terraform
Week 4-8   Parallel data/media sync + dark launch
Week 8-9   OAuth/FCM dual config + full test
Week 9     Cutover window
Week 9-11  Hypercare
Week 12+   Decommission planning
```

Azure/AWS timelines typically **2–4×** longer.

---

# PART 25 — Final Recommendation

## 25.1 Decision framework

| Criterion | Weight | Best fit |
|-----------|--------|----------|
| Preserve current architecture | High | Stay GCP / GCP→GCP |
| Minimize downtime & risk | High | GCP→GCP |
| Cost of migration program | High | Stay / GCP→GCP |
| FinOps of dual-run | Med | Stay / GCP→GCP |
| Multi-cloud mandate | Conditional | Azure or AWS only if mandated |
| AI future (GCP Vertex / Google APIs) | Med | Stay GCP |
| FCM + Google OAuth adjacency | High | Stay GCP |
| Vendor lock-in reduction | Med | Multi-cloud **after** IaC maturity |
| Team productivity | High | Stay on known Run/SQL/Build tooling |

## 25.2 Recommendations (objective)

### 1) Default: **Remain on Google Cloud** with hardened posture

**Why:** Scrolith is already a Cloud Run + Cloud SQL + GCS + Cloud Build + FCM system. Productivity and reliability are highest here.

**Do instead of migrating:**

- Multi-region DR for SQL + GCS  
- Terraform all prod  
- Automated restore drills quarterly  
- Separate prod/stage projects  
- Billing budgets & anomaly alerts  

### 2) If account isolation / M&A / billing split is required: **GCP project → GCP project**

**Why:** Same services, same skills, lowest rewrite; can still achieve org separation.

**How:** Execute Parts 5–22 with Strategy A.

### 3) Migrate to **Azure or AWS** only with explicit multi-year platform sponsorship

**Why not first:** Re-platforming Cloud Run semantics, build pipelines, IAM, networking, and ops runbooks dwarfs “lift and shift.” FCM remains Google anyway; Google OAuth remains Google.

**If mandated:**  

- Phase 0: 100% Terraform + contract tests  
- Re-implement compute on Container Apps/ECS  
- Postgres on Flexible Server/RDS with logical replication  
- Object storage dual-run for months  
- Accept dual-cloud ops cost  

## 25.3 What not to do

- Do not “recreate in console by hand” in a weekend  
- Do not switch DNS before dark-launch validation  
- Do not rotate JWT and DNS in the same untested window  
- Do not move KYC buckets without compliance review  
- Do not ship Android against unverified API hosts  
- Do not delete the old project for 30–90 days post-cutover  

## 25.4 Closing statement

Scrolith can be migrated safely **only** as an enterprise program: inventory → dual environment → proven restore → canary/DNS cutover → hypercare → decommission.  

Given the verified architecture (Cloud Run multi-service, Cloud SQL Postgres 16, GCS media/KYC, Secret Manager, Artifact Registry, FCM Android, OAuth on api/scrolith.com), the **lowest-risk, highest-fidelity path is remaining on GCP or moving to a new GCP project/account**, not a first-pass hyperscaler rewrite.

---

## Appendix A — Inventory command pack (quick reference)

```bash
export PROJECT=scrolith-500821
export REGION=asia-southeast1
gcloud config set project $PROJECT
gcloud run services list --region=$REGION
gcloud sql instances list
gcloud artifacts repositories list --location=$REGION
gcloud secrets list
gcloud storage buckets list
gcloud iam service-accounts list
gcloud dns managed-zones list
gcloud builds list --limit=20
```

## Appendix B — Related Scrolith docs

| Doc | Relevance |
|-----|-----------|
| `Agents.md` | Platform standards; cloud inventory list |
| `PHASE25B/C OAuth` | OAuth env & exchange cutover lessons |
| `PHASE25/27 Android` | FCM, AAB, channels |
| `PHASE26/26A Multilingual` | DB additive migrations pattern |
| `PHASE26B/C Onboarding` | FE-only deploy pattern |
| `deploy/` | Dockerfiles, Scrolitha engine |

## Appendix C — Assumptions log (must close in Discovery)

| ID | Assumption | Owner |
|----|------------|-------|
| A1 | Full Secret Manager list beyond sample of 3 | Security |
| A2 | Exact Cloud SQL HA/replica/PITR settings | DBA |
| A3 | Presence/absence of global LB vs pure domain mapping | Network |
| A4 | Socket.io hosting path (same BE vs separate) | Backend |
| A5 | Stripe/webhook endpoint inventory | Payments |
| A6 | Whether Scrolitha model weights are local container vs API | AI |
| A7 | All Pub/Sub/Scheduler jobs (if any) | Platform |

---

**Document control**

| Version | Date | Author role | Change |
|---------|------|-------------|--------|
| 1.0 | 2026-07-20 | Principal Cloud / Migration | Initial enterprise blueprint grounded in live GCP inventory |

**End of blueprint**
