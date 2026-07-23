# Pinned Messages

## Summary

Participants can pin important messages in direct and group conversations. Pins sync in realtime, support multi-pin (latest first, max 10), and the UI banner navigates to the original message with highlight animation.

## Permissions

### Direct messages

Either participant may pin or unpin.

### Group chats

Configurable via `ConversationSettings.pinPolicy`:

| Value | Who may pin |
|-------|-------------|
| `OWNER_ADMIN` (default) | Owner + Admin (permission engine `canPin`) |
| `EVERYONE` | All active members |

## Behavior

- Pin / unpin / re-pin (noop if already pinned)
- Multiple pins, ordered by rank then `createdAt`
- **Maximum 10** pins per conversation (`MAX_PINNED_MESSAGES`)
- When exceeded, oldest pins are removed automatically
- Soft-deleted messages are filtered out of list responses

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/messages/groups/:id/pins` | List pins (members only) |
| POST | `/api/messages/groups/:id/pins` | Body: `{ messageId }` |
| DELETE | `/api/messages/groups/:id/pins/:messageId` | Unpin |
| GET | `/api/messages/conversations/:id/pins` | Alias (DM + group) |
| POST | `/api/messages/conversations/:id/pins` | Alias |
| DELETE | `/api/messages/conversations/:id/pins/:messageId` | Alias |

All require authentication. List requires active membership.

## Database

`ConversationPinnedMessage`:

- `conversationId`, `messageId`, `pinnedById`, `rank`, `createdAt`
- Unique `(conversationId, messageId)`

`ConversationSettings.pinPolicy` (default `OWNER_ADMIN`).

Migration: `20260723150000_messaging_appearance_pins` (additive `pinPolicy`; pin table already from Phase 29.1).

## Realtime

- `messages:pin_updated` — `{ conversationId, action, messageId, pins, actorId }`
- For DIRECT, also `messages:conversation_updated` with `pins` for clients not in a group room

## UI

- Context menu: **Pin / Unpin** (`data-testid="message-pin-action"`)
- Sticky **Pinned Message Banner** (`data-testid="group-pins-banner"`)
- Tap banner → smooth scroll + highlight (~1.6–1.8s)
- Works on full Messages page and desktop dock chat windows

## Related files

- `groupPinService.ts`, `groupRealtime.controller.ts`
- Frontend: `Messages.tsx`, `MessagingChatWindow.tsx`, `GroupManagePanel.tsx`
