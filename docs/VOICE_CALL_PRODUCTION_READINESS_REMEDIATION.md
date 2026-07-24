# Scrolith Voice Calling — Production Readiness Remediation

**Date:** 2026-07-24  
**Mode:** Targeted remediation only  
**Production traffic:** Unchanged (FE/BE remain on locked 100% revisions)

---

## Final Decision

# PRODUCTION READINESS REMEDIATION — FAIL

**Reason (blocking):** Dual-device live WebRTC lab and relay-only media proof against authenticated candidate sessions were not completed in this automation window. TURN infrastructure and REQUEST mode code are implemented and candidates are at 0%, but success criteria require live dual-device + relay media success.

---

## Candidate Revisions

| Component | Revision | Tag | Traffic | Commit |
|-----------|----------|-----|---------|--------|
| **Production FE** | `scrolith-frontend-00352-cez` | `fe-msg-soft-open-97e0ce1c` | **100%** | (pre-remediation) |
| **Production BE** | `scrolith-backend-00291-pew` | `be-msg-avatar-dedupe-0dd9d2c5` | **100%** | (pre-remediation) |
| **Candidate FE (isolated)** | `scrolith-frontend-00355-kax` | `voice-remediation-isolated` | **0%** | `361ac6e2` |
| **Candidate BE** | `scrolith-backend-00295-bob` | `voice-remediation` | **0%** | `38d43390` |

### Candidate URLs

| Surface | URL |
|---------|-----|
| FE isolated | https://voice-remediation-isolated---scrolith-frontend-25ysnpjdda-as.a.run.app |
| BE candidate | https://voice-remediation---scrolith-backend-25ysnpjdda-as.a.run.app |
| Coturn TURN host | `34.142.177.171:3478` (UDP/TCP) |

**Isolation:** FE image built with  
`VITE_API_URL=https://voice-remediation---scrolith-backend-25ysnpjdda-as.a.run.app/api`  
so REST/Socket targets the BE candidate tag, not production API.

---

## Workstream 1 — TURN

### Architecture

| Item | Value |
|------|--------|
| VM | `scrolith-coturn-candidate` (e2-micro, `asia-southeast1-a`) |
| Image | `coturn/coturn:4.6.2` (Docker host network) |
| Auth | coturn `--use-auth-secret` + Secret Manager `VOICE_ICE_TURN_SECRET` |
| Client creds | Time-limited HMAC-SHA1 (`expiry:userId` / base64 HMAC) minted by BE |
| Ports | 3478 UDP/TCP, relay 49152–49200 UDP |
| Firewall | `scrolith-coturn-3478-udp`, `scrolith-coturn-3478-tcp`, `scrolith-coturn-relay-udp` |
| Secrets in Git | **No** |

### Validation

| Check | Result |
|-------|--------|
| Coturn container running | **PASS** (docker ps shows coturn Up) |
| Listening 3478 | **PASS** (ss shows turnserver on 3478) |
| Secret Manager secret | **PASS** `VOICE_ICE_TURN_SECRET` |
| Runtime SA accessor | **PASS** `scrolith-runner` + compute SA |
| Local mint `hasTurn: true` | **PASS** (with env + secret) |
| Unauth `/messages/voice/ice-servers` | **PASS** HTTP 401 |
| Authenticated hasTurn on candidate | **PENDING** (requires test JWT in lab) |
| Relay-only media | **PENDING** live lab |
| TLS TURN (turns:) | **NOT configured** (UDP/TCP only this phase) |

Evidence: `geezle/docs/evidence/voice-call-remediation/turn-infrastructure.json`

---

## Workstream 2 — REQUEST participation mode

### Implementation

| Layer | Detail |
|-------|--------|
| Policy | `REQUEST` denies join/accept unless `isJoinApproved` / invited / mod / host |
| Persistence | `VoiceCall.metadata.joinRequests[]` (no migration) |
| States | pending, approved, rejected, cancelled, expired, (+ capacity/ineligible codes) |
| Socket | `call:join-request`, `call:join-requested`, `call:join-approve`, `call:join-approved`, `call:join-reject`, `call:join-rejected`, `call:join-cancel` |
| FE | Minimal modal: Request to Join, pending, approve/reject list |

### Automated tests

| Suite | Result |
|-------|--------|
| Join request lifecycle | **PASS** |
| Expire pending | **PASS** |
| REQUEST blocks without approval | **PASS** |
| request_join allowed for members | **PASS** |

### Live dual-device REQUEST flow

**PENDING** (needs two authenticated users on isolated candidates).

---

## Workstream 3 — Candidate isolation

| Check | Result |
|-------|--------|
| FE build API base = BE candidate | **PASS** (cloudbuild args) |
| BE CORS includes isolated FE origin | **PASS** (env `CORS_ALLOWED_ORIGINS`) |
| Production traffic | **PASS** — still 100% prior revisions |
| No merge to production | **PASS** |

---

## Workstream 4–5 — Dual-device / NAT lab

| Scenario | Result |
|----------|--------|
| Same LAN / cross-network / mobile | **NOT RUN** (human lab required) |
| Relay-only `VOICE_ICE_FORCE_RELAY` | Config support **PASS**; live media **PENDING** |
| ICE restart | Code present; live **PENDING** |

---

## Workstream 6 — Admin controls

Unchanged UI keys. Server reads `MessengerVoiceConfig` per request.  
Unit coverage for disable/block/max participants: **PASS**.  
Live admin toggle on candidate: **PENDING**.

---

## Workstream 7 — Regression

| Area | Result |
|------|--------|
| Messaging/groups/voice notes routes | Unchanged by design |
| Production still pre-voice-remediation | **PASS** (isolation) |
| Full E2E regression suite | **NOT re-run** |

---

## Workstream 8 — Automated tests

```
messengerCallPolicy: 8 passed
messengerCallJoinRequest + ICE: 6 passed
tsc production build: PASS
```

Evidence: `geezle/docs/evidence/voice-call-remediation/automated-tests.json`

---

## Git summary

| Commit | Branch | Content |
|--------|--------|---------|
| `38d43390` | `candidate/messaging-enhancements-be` | REQUEST join requests, time-limited TURN |
| `361ac6e2` | `hotfix/fe-asset-404-cache` | REQUEST UI hooks + modal |

---

## Candidate deployment summary

| Step | Status |
|------|--------|
| Coturn VM + firewall | Done |
| Secret Manager TURN secret | Done |
| BE image `voice-remediation` | Done |
| BE revision tag `voice-remediation` @ 0% | Done (`00295-bob` family) |
| FE image `voice-remediation-isolated` | Done |
| FE tag `voice-remediation-isolated` @ 0% | Done (deploy step) |
| Production FE/BE traffic | **Unchanged 100%** |

---

## Gate scorecard

| Gate | Status |
|------|--------|
| TURN configured | **PASS** (infra) |
| hasTurn true | **PASS** (local mint); live auth API **PENDING** |
| Relay-only media succeeds | **FAIL / PENDING** |
| Direct calls separate networks | **PENDING** |
| Mobile-data testing | **PENDING** |
| REQUEST fully enforced | **PASS** (code+unit); live **PENDING** |
| FE only talks to candidate BE | **PASS** (build args) |
| Admin controls | **PASS** (architecture+unit) |
| Group permissions | **PASS** (unit) |
| No critical security issue | **PASS** (auth gate, secret not in git) |
| Messaging regression | **PASS** (prod isolation) |
| Automated tests | **PASS** |
| Live dual-device | **FAIL / NOT RUN** |

---

## Production rollout recommendation

**Do not stage production traffic.**

### Clear remaining blockers

1. Authenticated call to candidate `GET /api/messages/voice/config` → confirm `hasTurn: true` and TURN urls present (no secret values logged).  
2. Dual-device lab on:
   - FE: `voice-remediation-isolated`
   - BE: `voice-remediation`
3. Force relay test: set `VOICE_ICE_FORCE_RELAY=true` on candidate BE only, confirm media via relay.  
4. Exercise REQUEST: member request → owner approve → join; reject; cancel; expire.  
5. Admin disable voice mid-lab; confirm new initiates fail.  
6. Re-issue certification with green dual-device + NAT sections.

When those pass, only then consider staged production: **5% → 25% → 50% → 100%**.

---

## Security notes

- TURN secret never printed in this report or committed to Git.  
- Client receives only time-limited username/credential pairs.  
- ICE endpoints require authentication.  
- Coturn is authenticated (no open relay).  
- Candidate BE CORS scoped for candidate FE origins + production domains.
