# Phase 22.3B — Messaging Privacy Controls & Enterprise Conversation Settings

**Status:** Implementation complete (deployment deferred to Phase 22.3C)  
**Date:** 2026-07-20  
**Deployment:** `deploymentPerformed: false`  

**Commits**

| Repo | Hash | Message |
|------|------|---------|
| monorepo (backend + docs) | `ff64d459` / `17b8e3ed` | BE privacy + docs/gate |
| geezle (frontend submodule) | `76a30ab0` | FE privacy panel + menu |

## Objective

Enterprise messaging privacy + conversation control experience:

- Global privacy: online, last seen, read receipts, typing, recording, DM audience, group invite audience, notification previews
- Conversation menu hardening (optimistic + rollback, unarchive toggle, grouped IA)
- Server-side policy engine (never FE-only enforcement)
- Realtime self-sync via `messages:privacy:updated`
- Additive schema only; defaults preserve current production behavior

## Existing three-dot menu audit

| Action | Frontend | Handler | API | Persistence | Realtime | Gaps (pre-22.3B) | Hardened |
|--------|----------|---------|-----|-------------|----------|------------------|----------|
| Move to Other | Messages.tsx menu | `handleConversationAction` | `PATCH .../preferences` `{label:'other'}` | participant prefs | `messages:conversation_updated` | No optimistic UI | Optimistic + rollback |
| Label as Jobs | same | same | preferences `{label}` | same | same | No toggle off | Toggle jobs↔other |
| Mark as unread | same | same | `POST .../unread` | watermarks/unread | same | No optimistic | Optimistic + rollback |
| Star / Remove Star | same | same | preferences `isStarred` | same | same | API-then-UI | Optimistic + rollback |
| Mute / Unmute | same | same | preferences `isMuted` | same | same | API-then-UI | Optimistic + rollback |
| Archive / Unarchive | same | same | preferences `isArchived` | same | same | Archive only | **Unarchive toggle** |
| Report / Block | same | same | `POST .../report-block` | block + report | limited | No confirm | Confirm dialog |
| Delete / Leave | same | same | `DELETE conversation` | soft leave/delete | `conversation_deleted` | Flat “Delete” for groups | Group: Leave group |
| Manage settings | dialog | open settings | user settings only | InMail/requests | none | No privacy panel | Full privacy tabs |
| Group settings | GroupManagePanel | open panel | group APIs | roles/members | group events | OK | Kept under Conversation |

## Root gaps found

1. Manage settings only exposed InMail/message-requests — no presence/receipt/typing privacy.
2. Archive had no unarchive path in the menu.
3. Menu actions were not optimistic; failures left UI out of date until refresh (now rollback).
4. Flat menu mixed global privacy with conversation actions.
5. No canonical privacy contract or server policy module (added).
6. Presence reuse of `presenceVisibility` was incomplete for last-seen, receipts, typing, DM, invites, previews.

## Privacy architecture

### Canonical model

```ts
type PrivacyAudience = 'EVERYONE' | 'CONTACTS' | 'NOBODY';
type DirectMessageAudience = 'EVERYONE' | 'CONTACTS' | 'FOLLOWERS' | 'NOBODY';

type MessagingPrivacySettings = {
  onlineStatusVisibility: PrivacyAudience; // maps to User.presenceVisibility
  lastSeenVisibility: PrivacyAudience;
  readReceiptsEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  recordingIndicatorsEnabled: boolean;
  directMessageAudience: DirectMessageAudience;
  groupInviteAudience: PrivacyAudience;
  notificationMessagePreviewEnabled: boolean;
  updatedAt: string | null;
};
```

- **Contact** = either-direction `Follow` edge (existing relationship model).
- **Do not** rename DB column `presenceVisibility`; app layer exposes `onlineStatusVisibility`.
- Defaults all match current production (visible/enabled/everyone).

### Policy module

`geezle-backend/src/services/messaging/messagingPrivacyPolicy.ts`

| Function | Purpose |
|----------|---------|
| `canViewerSeeOnlineStatus` | Online/away/offline disclosure |
| `canViewerSeeLastSeen` | Last-seen timestamp disclosure |
| `canViewerSeeReadReceipt` | Whether reader discloses read state |
| `canViewerReceiveTypingEvent` | Typing fan-out gate |
| `canViewerReceiveRecordingEvent` | Recording fan-out gate |
| `canInitiateDirectMessage` | New DM gate |
| `canInviteToGroup` | Group add / invite gate |
| `canIncludeMessagePreview` | Push body preview gate |
| `projectPresenceForViewer` | Safe presence projection |

### Privacy behavior matrix (summary)

| Setting | EVERYONE / on | CONTACTS | NOBODY / off |
|---------|---------------|----------|--------------|
| Online | Peers see live state | Contacts only | Privacy-safe offline |
| Last seen | Exact when allowed | Contacts only | No timestamp leak |
| Read receipts | Visible ticks | n/a | Internal watermark advances; peers do not see read |
| Typing | Emits events | n/a | No emit; local compose OK |
| Recording | Emits events | n/a | No emit; recording works |
| DM audience | New DMs allowed | Contacts only | Block new unsolicited DMs; keep existing |
| Group invite | Adds allowed | Contacts only | Generic error to inviter |
| Notify preview | Body allowed | n/a | Generic “New message from …” |

## Database changes

Migration: `20260720180000_phase223b_messaging_privacy`

Additive columns on `"User"`:

- `lastSeenVisibility` TEXT DEFAULT 'EVERYONE'
- `readReceiptsEnabled` BOOLEAN DEFAULT true
- `typingIndicatorsEnabled` BOOLEAN DEFAULT true
- `recordingIndicatorsEnabled` BOOLEAN DEFAULT true
- `directMessageAudience` TEXT DEFAULT 'EVERYONE'
- `groupInviteAudience` TEXT DEFAULT 'EVERYONE'
- `notificationMessagePreviewEnabled` BOOLEAN DEFAULT true
- `messagingPrivacyUpdatedAt` TIMESTAMP(3)
- ensures `presenceVisibility` exists

**Do not apply automatically in 22.3B.** Apply in Phase 22.3C before backend promote.

## API contracts

```
GET  /api/messages/settings/privacy
PATCH /api/messages/settings/privacy
```

Auth: signed-in user only (self settings).

PATCH body fields (all optional):  
`onlineStatusVisibility` | `presenceVisibility`, `lastSeenVisibility`,  
`readReceiptsEnabled`, `typingIndicatorsEnabled`, `recordingIndicatorsEnabled`,  
`directMessageAudience`, `groupInviteAudience`, `notificationMessagePreviewEnabled`

Response:

```json
{
  "success": true,
  "data": {
    "settings": { "...": "..." },
    "version": "22.3B"
  }
}
```

Existing mute/archive/star/read/preferences endpoints unchanged.

## Socket.IO

| Event | Audience | Payload |
|-------|----------|---------|
| `messages:privacy:updated` | Self room `community:user:{userId}` only | `{ userId, updatedAt, version, settings }` |

Peers never receive full privacy config. Presence/receipt surfaces recompute via existing policy on next emission/query.

**Conflict strategy:** server last-write-wins using `messagingPrivacyUpdatedAt`. Clients refetch on reconnect and on `messages:privacy:updated`.

## Frontend components

| File | Role |
|------|------|
| `MessagingPrivacySettingsPanel.tsx` | Privacy UI (radios, switches, optimistic save) |
| `conversationMenuPolicy.ts` | Menu IA grouping |
| `Messages.tsx` | Menu + Manage settings tabs + socket reconcile |
| `services/messaging.ts` | GET/PATCH privacy + normalize helpers |

Manage settings tabs: **Privacy** | **Inbox & InMail** | **Safety**

## Files changed (implementation)

### Backend
- `prisma/schema.prisma`
- `prisma/migrations/20260720180000_phase223b_messaging_privacy/migration.sql`
- `src/services/messaging/messagingPrivacyPolicy.ts`
- `src/controllers/messagingPrivacy.controller.ts`
- `src/routes/messages.routes.ts`
- `src/controllers/presence.controller.ts` (projection)
- `src/controllers/messages.controller.ts` (DM gate, receipt strip)
- `src/controllers/groupMessaging.controller.ts` (invite gate)
- `src/controllers/messageReceipts.controller.ts`
- `src/services/messaging/receiptPolicy.ts`
- `src/services/messageNotifications.ts`
- `src/server.ts` (typing/recording gates)
- `src/services/messaging/__tests__/messagingPrivacyPolicy.spec.ts`

### Frontend
- `src/services/messaging.ts`
- `src/components/messaging/MessagingPrivacySettingsPanel.tsx`
- `src/components/messaging/conversationMenuPolicy.ts`
- `src/components/messaging/index.ts`
- `src/messages/Messages.tsx`
- `src/components/messaging/__tests__/conversationMenuPolicy.spec.ts`
- `src/services/__tests__/messagingPrivacyNormalize.spec.ts`

### Docs
- `docs/PHASE22_3B_MESSAGING_PRIVACY.md`
- `docs/PHASE22_3B_COMPLETION_GATE.md`

## Security review

- Policy enforced server-side for presence, receipts, typing, recording, DM create, group invite, notify previews.
- Generic errors for DM/group privacy denials (no setting leakage).
- Privacy settings endpoint is self-only.
- Socket privacy payload is self-room only.
- No secrets or PII in client logs beyond userId/timestamps.

## Accessibility review

- Switches use `role="switch"` + `aria-checked`
- Audience choices use radiogroups/fieldsets
- Settings tabs use `role="tablist"` / `aria-selected`
- Conversation menu uses `role="menu"` / `menuitem`
- Focus/keyboard via native controls + MobileDialog Escape close

## Migration / rollout (22.3C)

1. Apply additive migration on Cloud SQL
2. Deploy backend tagged @0% → cert → promote
3. Deploy frontend tagged @0% → cert → promote
4. Confirm defaults: users with untouched settings see no behavior change
5. Rollback targets: inspect live traffic at deploy time (baseline noted: BE `00156-jor` / FE `00211-kev` for p223; verify before 22.3C)

## Rollback strategy

- FE rollback: previous frontend revision (no new API required for old UI)
- BE rollback: previous backend; additive columns harmless if left in place
- Do not drop privacy columns on rollback

## Scope exclusions (confirmed)

No E2EE, disappearing messages, attachment catalog redesign, AI summaries, Redis deployment, messaging microservices, Phase 22.4 media, feed/Scroll recommendation changes.

## Phase 21 / 22.1–22.3 impact

Unaffected by design: no feed routes, Scroll rec routing, outbox idempotency, or presence/receipt core algorithms rewritten — only privacy gates around existing systems.
