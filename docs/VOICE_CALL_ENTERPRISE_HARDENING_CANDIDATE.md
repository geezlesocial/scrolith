# Scrolith Voice Calling — Enterprise Hardening (Candidate)

**Status:** Candidate-ready hardening of the existing messenger WebRTC stack  
**Date:** 2026-07-24  
**Scope:** Harden & complete without redesigning admin settings or messaging UI  
**Deployment:** Candidate environment only (not production)

---

## 1. Architecture report

### Current foundation (preserved)

```
Messages UI → VoiceCallProvider (mesh RTCPeerConnection)
       ↕ Socket.IO /community
server.ts call:* handlers → Prisma VoiceCall / VoiceCallParticipant
       → MessengerVoiceConfig (admin flags)
       → SYSTEM DirectMessage call summaries
```

### Hardening layers added

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| Platform policy | `MessengerVoiceConfig` | enable/disable voice, conference, notes, max participants, blocked IDs |
| Group policy | `ConversationSettings.policyJson.callPolicy` | whoCanStart / whoCanJoin / whoCanInvite / participationMode / availability |
| Authorization | `messengerCallPolicy.service.ts` | Role hierarchy + platform override + membership |
| ICE / TURN | `messengerCallIce.service.ts` | STUN/TURN from env; exposed via runtime config |
| Media client | `VoiceCallProvider.tsx` | Echo cancel, noise suppress, AGC; ICE restart; leave vs end |
| Privacy | `call:participant:add` | Only active conversation members (no silent DM→group hijack) |

### Hierarchy (enforced)

```
Platform Administrator (MessengerVoiceConfig)
        ↓
Group Owner / Admin (callPolicy in policyJson)
        ↓
Group Moderator
        ↓
Regular Member
```

---

## 2. Backend implementation summary

### New modules

- `geezle-backend/src/services/messaging/messengerCallPolicy.service.ts`
- `geezle-backend/src/services/messaging/messengerCallIce.service.ts`
- `geezle-backend/src/__tests__/messengerCallPolicy.unit.test.ts`

### Socket.IO hardening (`server.ts`)

- `call:initiate` — live membership (non-deleted), platform + group authorize, filter blocked targets, policy snapshot on call metadata
- `call:accept` — re-check membership + join policy before media join
- `call:participant:add` — **removed** auto-add outsiders / auto-convert DIRECT→GROUP; invite only active members; invite authorize
- `call:participant:left` — if last joined leaves, end call + summary

### REST (backward compatible)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/messages/voice/config` | Existing flags **+** `iceServers`, `iceTransportPolicy`, `hasTurn` |
| GET | `/api/messages/voice/ice-servers` | ICE payload only |
| GET | `/api/messages/conversations/:id/call-policy` | Resolve group call policy |
| PATCH | `/api/messages/conversations/:id/call-policy` | Owner/admin update `policyJson.callPolicy` |

### Admin settings

Unchanged UI keys:

- Voice Calls, Conference Calls, Voice Notes, Max Participants, Max Voice Note Duration, Blocked User IDs

Still enforced server-side on every initiate / note / invite.

---

## 3. Frontend implementation summary

| File | Change |
|------|--------|
| `VoiceCallProvider.tsx` | Dynamic ICE from runtime config; audio constraints; ICE candidate queue; ICE restart on disconnect/failed; multiparty **leave** vs 1:1 **end** |
| `messaging.ts` | Pass through ICE fields; call-policy GET/PATCH helpers |
| UI shell | Unchanged call buttons / modal (no redesign) |

---

## 4. WebRTC flow (hardened)

```
Caller startCall
  → call:initiate (policy + membership + busy + rate limit)
  → call:ringing to eligible members
  → Callee accept → call:accept (re-auth)
  → Mesh offers via call:signal (offer/answer/candidate)
  → ICE restart if connectionState failed/disconnected
  → End: call:end (1:1) or call:participant:left (conference leave)
  → Summary SYSTEM message persisted
```

### Audio constraints

- `echoCancellation: true`
- `noiseSuppression: true`
- `autoGainControl: true`

---

## 5. Socket event documentation

| Event | Direction | Notes |
|-------|-----------|--------|
| `call:initiate` | C→S | Create RINGING session |
| `call:ringing` | S→C | Callees |
| `call:accept` | C→S | Join + ACTIVE |
| `call:reject` | C→S | Reject all |
| `call:end` | C↔S | End for everyone |
| `call:participant:add` | C→S | Invite **existing member only** |
| `call:participant:left` | C→S | Leave; may end if last |
| `call:participant:joined` | S→C | Peer joined |
| `call:signal` | C↔S | SDP/ICE relay |
| `call:busy` | S→C | Busy conflict |
| `messenger:call_*` | S→C | Lifecycle aliases |

Idempotency: status transitions use `updateMany` with status guards; duplicate rejects return current state.

---

## 6. Database changes

**None required for this candidate.**

Call policy stored in existing `ConversationSettings.policyJson.callPolicy` JSON.

Call records still use:

- `VoiceCall`, `VoiceCallParticipant`, `MessengerVoiceConfig`
- SYSTEM `DirectMessage` summaries with `metadata.voiceCall`

Optional future (not in this PR): dedicated call metrics columns.

---

## 7. Security report

| Control | Status |
|---------|--------|
| JWT socket auth | Existing |
| Conversation membership (active, non-deleted) | Hardened |
| Platform disable / blocked IDs | Hardened |
| Group role start/join/invite | Added |
| Max participants | Enforced |
| Rate limit initiate | Existing (8/min) |
| Busy detection | Existing |
| No client-only auth | Server enforces on all call actions |
| TURN credentials | Server-side env only; client receives ICE config over HTTPS |

---

## 8. Performance report

- Soft ICE config fetch once per VoiceCallProvider mount
- No extra DB tables
- Candidate queue avoids renegotiation storms
- ICE restart limited once per peer (8s cooldown)
- Mesh still limited by browser + `maxParticipants` (no SFU yet)

---

## 9–12. Test / stress / browser / mobile

### Automated

- `messengerCallPolicy.unit.test.ts` — platform disable, owner-only, conference disable, blocked, max participants, policy merge

### Manual candidate checklist

1. Direct call 1:1 (same Wi-Fi + cellular if TURN configured)
2. Group call multi-member (owner start)
3. Member start when whoCanStart=OWNER_ONLY → denied
4. Admin disable voice → buttons fail + socket rejects
5. Max participants
6. Blocked user cannot initiate
7. Mid-call leave multiparty leaves others connected
8. Network toggle → ICE restart
9. Incoming ring + accept
10. Voice notes still work
11. Messaging/groups/AI unaffected

### Browser / mobile

- Chrome / Edge / Firefox desktop: supported mesh + constraints
- Safari: WebRTC audio supported; TURN recommended
- Android Capacitor: same web stack; mic permissions via existing MainActivity bridge
- Background VoIP / CallKit: **not in this candidate** (documented gap)

### Stress (candidate)

- Concurrent initiates (rate limit)
- Ring timeout sweep
- Concurrent conferences in separate groups

---

## 13. Git summary

Backend branch: `candidate/messaging-enhancements-be` (or current candidate)  
Frontend: VoiceCallProvider + messaging service updates on FE branch

---

## 14. Files changed (this hardening)

### Backend

- `src/services/messaging/messengerCallPolicy.service.ts` (new)
- `src/services/messaging/messengerCallIce.service.ts` (new)
- `src/__tests__/messengerCallPolicy.unit.test.ts` (new)
- `src/server.ts` (call handlers)
- `src/controllers/messenger.voice.controller.ts`
- `src/routes/messages.routes.ts`

### Frontend

- `src/messages/VoiceCallProvider.tsx`
- `src/services/messaging.ts`

### Docs

- `docs/VOICE_CALL_ENTERPRISE_HARDENING_CANDIDATE.md`

---

## 15. Candidate deployment report

### Env (candidate)

```bash
# Optional but recommended for production-grade NAT
VOICE_ICE_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
VOICE_ICE_TURN_URLS=turn:turn.example.com:3478
VOICE_ICE_TURN_USERNAME=...
VOICE_ICE_TURN_CREDENTIAL=...
# VOICE_ICE_FORCE_RELAY=true  # optional hard relay
VOICE_CALL_RING_TIMEOUT_MS=30000
```

### Deploy steps (candidate only)

1. Deploy backend candidate revision with new routes/handlers  
2. Deploy frontend candidate with VoiceCallProvider ICE/restart  
3. Smoke call 1:1 + group  
4. Flip admin voice off → verify reject  
5. Do **not** promote to production until TURN verified on cellular

### Rollback

- Revert FE revision → previous VoiceCallProvider  
- Revert BE revision → previous `call:*` handlers  
- No DB migration to reverse

---

## Remaining roadmap (post-candidate)

1. SFU for large conferences  
2. App-global incoming call UI (outside `/messages`)  
3. Push VoIP / Android ConnectionService  
4. Full call-history product surface  
5. Host transfer UI + lock/unlock call  
6. Quality metrics dashboard  

---

## Success criteria (candidate)

| Criterion | Candidate status |
|-----------|------------------|
| Direct voice works | Yes (mesh + ICE) |
| Group/conference works | Yes (mesh, membership-gated) |
| Admin enable/disable | Yes (server) |
| Max participants | Yes |
| Blocked users | Yes |
| Authz per event | Hardened |
| ICE restart recovery | Yes |
| TURN path | Env-ready (configure TURN for full NAT) |
| No messaging regression | Design preserves UI/APIs |
| Production deploy | **Not done** — candidate only |
