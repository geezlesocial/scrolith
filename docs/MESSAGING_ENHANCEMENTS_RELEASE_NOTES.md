# Release Notes — Enterprise Messaging Enhancements (Candidate)

**Version label:** messaging-enhancements  
**Backend SHA:** `51716906`  
**Frontend SHA:** `92da8d29`  
**Date:** 2026-07-23  
**Audience:** Operators, QA, Engineering

---

## What's new

### Group profile photo
- Owners and admins can upload, change, or remove a group photo (JPG/PNG/WEBP/AVIF, max 10 MB).
- Photo appears in inbox, conversation header, dock windows, and group settings.
- Falls back to generated initials when no photo is set.
- Realtime updates via `messages:group_updated` / `messages:conversation_updated`.

### Pinned messages
- Direct chats: either participant may pin.
- Groups: default owner+admin (`pinPolicy`), optional `EVERYONE`.
- Up to 10 pins; oldest auto-unpinned when over the limit.
- Sticky banner scrolls to the original message with highlight animation.
- Realtime: `messages:pin_updated`.

### Chat appearance (personal)
- Each user customizes each conversation independently (peers never see your background).
- Solid, gradient, pattern, and photo backgrounds (max 15 MB).
- Opacity and blur controls; drag-drop and clipboard paste on web.
- Synced across devices via account preference APIs.

### Adaptive text color
- Automatic palette from background luminance (WCAG AA-oriented).
- Covers bubbles, pins, timestamps, mentions, system text, and more via CSS variables.

---

## API additions (auth required)

- `GET|PUT|DELETE /api/messages/conversations/:id/appearance`
- `GET|POST|DELETE /api/messages/groups/:id/pins` (and conversation aliases)
- Group meta already supports `avatarFileId` on patch routes

---

## Database

Additive migration only:

- `ConversationParticipant.chatAppearanceJson`
- `ConversationSettings.pinPolicy`

---

## Deployment status

Candidate Cloud Run revisions at **0%** traffic. Production unchanged.

See `docs/MESSAGING_ENHANCEMENTS_CANDIDATE_DEPLOYMENT.md` for revision names, URLs, validation evidence, and promote checklist.
