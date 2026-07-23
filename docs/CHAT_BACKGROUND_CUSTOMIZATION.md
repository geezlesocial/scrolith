# Chat Background Customization

## Summary

Each user can customize the appearance of **each conversation independently**. Preferences are personal — peers never see another user’s background.

## Background kinds

| Kind | Description |
|------|-------------|
| `none` | Default surface |
| `solid` | Single color |
| `gradient` | Two-color gradient |
| `pattern` | Subtle dotted pattern over a base color |
| `wallpaper` / `photo` | Uploaded image (cover fit, optional blur) |

## Photo upload

- Gallery / camera / file picker (web)
- Formats: JPG, PNG, WEBP
- Maximum: **15 MB**
- Stored via `FileService` as private image; `fileId` + `imageUrl` saved in appearance JSON

## Storage model

`ConversationParticipant.chatAppearanceJson` (JSONB), per user per conversation.

Example:

```json
{
  "kind": "solid",
  "color": "#1e3a5f",
  "opacity": 1,
  "blurPx": 0,
  "version": 1
}
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/messages/conversations/:id/appearance` | Load personal appearance |
| PUT | `/api/messages/conversations/:id/appearance` | Save (validated) |
| DELETE | `/api/messages/conversations/:id/appearance` | Reset to default |

Requires membership. Emits `messages:appearance_updated` to the **same user** room only (multi-device sync).

## UI

- **Chat appearance** panel (`ChatAppearancePanel`)
- Palette button in conversation header and dock window
- Live preview with automatic text colors
- Opacity + blur controls for photo/wallpaper

## Performance

- Lazy load on open conversation
- Cached in component state for the active thread
- CSS backgrounds only (no heavy canvas sampling on every frame)

## Security

- Personal row only; cannot read/write another participant’s JSON
- Color / URL validation rejects XSS and `file://` schemes
- Auth + membership checks

## Related files

- Backend: `chatAppearanceService.ts`, `chatAppearance.controller.ts`
- Frontend: `ChatAppearancePanel.tsx`, `chatTextColorEngine.ts`, `Messages.tsx`, `MessagingChatWindow.tsx`
- Migration: `20260723150000_messaging_appearance_pins`
