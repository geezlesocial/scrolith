# Phase 29.0 — Enterprise Messaging Groups  
## Permission Matrix

**Status:** Design locked for Phase 29.1 implementation  
**Engine:** `permissionEngine.ts` (to be added) evaluating **effective permissions**  
**Compatibility:** Phase 22.2 role ranks remain the membership identity

---

## 1. Role ranks (identity)

| Role | Rank | Notes |
|------|------|-------|
| OWNER | 40 | Single primary owner; transfer is explicit |
| ADMIN | 30 | Includes Co-Owner profile via flag/overrides |
| MODERATOR | 20 | Content moderation, limited member ops |
| MEMBER | 10 | Default; Guest/ReadOnly via profile overlays |

Platform staff break-glass is **not** a conversation role — admin API only.

---

## 2. Default matrix (product defaults)

Legend: **Y** = allow · **N** = deny · **C** = configurable via ConversationSettings / overrides

| Permission | OWNER | ADMIN | MODERATOR | MEMBER | Guest profile | ReadOnly profile |
|------------|:-----:|:-----:|:---------:|:------:|:-------------:|:----------------:|
| canSend | Y | Y | Y | Y* | N | N |
| canReply | Y | Y | Y | Y* | Y* | N |
| canUploadFiles | Y | Y | Y | C | N | N |
| canUploadImages | Y | Y | Y | C | N | N |
| canUploadVideo | Y | Y | Y | C | N | N |
| canUploadAudio | Y | Y | Y | C | N | N |
| canUploadDocuments | Y | Y | Y | C | N | N |
| canPin | Y | Y | Y | N | N | N |
| canDeleteOwn | Y | Y | Y | Y | Y | N |
| canDeleteOthers | Y | Y | Y | N | N | N |
| canMentionEveryone | Y | Y | N | N | N | N |
| canCreatePoll | Y | Y | Y | C | N | N |
| canInvite | Y | Y | N | C | N | N |
| canKick | Y | Y | N** | N | N | N |
| canBan | Y | Y | N | N | N | N |
| canApproveJoin | Y | Y | Y | N | N | N |
| canEditGroup | Y | Y | N | N | N | N |
| canChangePhoto | Y | Y | N | N | N | N |
| canChangeBanner | Y | Y | N | N | N | N |
| canChangeDescription | Y | Y | N | N | N | N |
| canExportChat | Y | Y | N | N | N | N |
| canViewMembers | Y | Y | Y | Y | C | Y |
| canViewAnalytics | Y | Y | N | N | N | N |
| canCreateEvents | Y | Y | Y | C | N | N |
| canCreateThreads | Y | Y | Y | C | N | N |
| canScheduleMessages | Y | Y | N | N | N | N |

\* Subject to `messagingMode` (ANNOUNCEMENT / READ_ONLY / LOCKED suppress send).  
\** Moderator kick only MEMBER/Guest if override grants `canKickLimited`.

---

## 3. Messaging modes (conversation-level)

| Mode | Effect |
|------|--------|
| EVERYONE | Members with canSend may send |
| ADMINS_ONLY | OWNER + ADMIN only |
| MODS_PLUS | OWNER + ADMIN + MODERATOR |
| ANNOUNCEMENT | Same as ADMINS_ONLY; UI labels announcements |
| READ_ONLY | Nobody except OWNER (break-glass) |
| LOCKED | Emergency lockdown; only platform admin / OWNER unlock |

Mode **AND** permission must both pass.

---

## 4. Content settings gates

Even if `canUploadImages` is true, ConversationSettings may set `allowImages=false` → deny.

Applies to: images, videos, files, audio, voice, GIFs, stickers, polls, events, location, contacts, reactions, edit, delete, forward, copy.

---

## 5. Evaluation order

```
1. Not a member (or banned) → deny
2. Conversation LOCKED / archived → deny mutations (read may remain)
3. messagingMode restriction → may deny send/reply
4. Member restriction (MUTE, TEMP_BAN, BAN) → deny send
5. Effective permission matrix (role template + overrides)
6. Content settings for media kind
7. Rate limit / slow mode (temporal deny)
8. Allow
```

---

## 6. Phase 22.2 compatibility mapping

| 22.2 helper | 29 mapping |
|-------------|------------|
| canManageMembers | canInvite + canKick (+ canApproveJoin) |
| canEditGroupMeta | canEditGroup + photo/banner/description |
| canRemoveMember | canKick with rank rules |
| canChangeRoles | OWNER/ADMIN rules preserved; cannot create second OWNER without transfer |

---

## 7. Implementation notes

- Store templates as JSON for forward-compatible keys.  
- Unknown permission keys default to **deny**.  
- Unit tests must lock every cell of the default matrix.  
- FE never trusts client-side-only checks; always re-validate on API.
