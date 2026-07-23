# Group Profile Photo

## Summary

Authorized group owners and admins can upload, change, and remove a group profile photo. The photo is stored via the existing media/file pipeline and referenced on `Conversation.avatarFileId`.

## Permissions

| Role | View | Change / Remove |
|------|------|-----------------|
| Owner | Yes | Yes |
| Admin | Yes | Yes |
| Moderator / Member | Yes | No |

Enforced by `canEditGroup` / `canEditGroupMeta` on:

- `PATCH /api/messages/groups/:id` (`avatarFileId`)
- `PATCH /api/messages/conversations/:id/group` (`avatarFileId`)

## Upload constraints

- Formats: JPG, JPEG, PNG, WEBP, AVIF (when browser/media stack supports AVIF)
- Maximum size: **10 MB** (client validation; server file limits still apply)
- Image processing is handled by the existing upload pipeline (compress / thumbnail / EXIF stripping when available)

## Storage

- `Conversation.avatarFileId` → `File` record
- Optimized / thumbnail variants come from the shared media service (same as user avatars and message media)

## Display surfaces

- Inbox list (group row)
- Conversation header
- Desktop messaging dock window
- Group settings / manage panel
- Group member list contexts (initials fallback when missing)

Fallback: generated initials from the group title via `EnterpriseAvatar`.

## Realtime

On avatar change, servers emit:

- `messages:group_updated` (includes `avatarFileId`, `title`, `fields`)
- `messages:conversation_updated` (when avatar changes)

Clients update inbox and header without a full page reload.

## Security

- Authentication required
- Authorization: owner/admin (or platform admin) only for mutations
- File id must be a stored file owned via the authenticated upload path
- No destructive schema changes

## Related files

- Backend: `groupMessaging.controller.ts`, `groupEnterprise.controller.ts`, `Conversation.avatarFileId`
- Frontend: `GroupManagePanel.tsx`, `Messages.tsx`, `MessagingConversationRow.tsx`, `MessagingChatWindow.tsx`
