# Automatic Compatible Text Color Engine

## Summary

`chatTextColorEngine` derives a full chat color palette from the user’s selected background so text remains readable. Target contrast: **WCAG AA** (prefer AAA where palette design allows).

## Algorithm

1. Estimate background **relative luminance** from appearance:
   - Solid / pattern: parse CSS color
   - Gradient: average of start/end luminances
   - Photo / wallpaper: conservative mid-dark (0.28) until client sampling is available
   - None: near-white default surface
2. If luminance &lt; 0.45 → **dark** mode palette (light text)
3. Else → **light** mode palette (dark text)

## Palette tokens (CSS variables)

| Token | Use |
|-------|-----|
| `--chat-text` | Primary body |
| `--chat-text-secondary` | Secondary labels |
| `--chat-text-muted` | Muted / hints |
| `--chat-link` | Links |
| `--chat-timestamp` | Timestamps |
| `--chat-bubble-in` / `--chat-bubble-in-text` | Incoming bubbles |
| `--chat-bubble-out` / `--chat-bubble-out-text` | Outgoing bubbles |
| `--chat-mention` | Mentions |
| `--chat-reply-preview` | Reply previews |
| `--chat-reaction-bg` / `--chat-reaction-text` | Reactions |
| `--chat-pin-bg` / `--chat-pin-text` | Pinned banner |
| `--chat-system` | System messages |
| `--chat-input-hint` | Composer hints |
| `--chat-selection` | Selection highlight |
| `--chat-unread` | Unread badge |
| `--chat-date-sep` | Date separators |

## Dynamic updates

Palette recomputes immediately when:

- Background kind/color/photo changes
- Opacity / blur adjustments are applied
- Appearance loads from the server (multi-device)

## Accessibility

- High-contrast pairs for light/dark surfaces
- No reliance on color alone for pin state (icon + label)
- Smooth CSS transitions; no layout jumps when palette swaps
- Reduced motion: highlight animation is short pulse only

## Implementation

- Pure client utility: `geezle/src/services/messaging/chatTextColorEngine.ts`
- Unit tests: `chatTextColorEngine.spec.ts`
- Applied on Messages history viewport and dock chat surface

## Future enhancements (non-blocking)

- Sample average luminance from uploaded wallpaper canvas
- Explicit high-contrast user preference override
