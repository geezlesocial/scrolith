# Phase 20.8.1 — Mobile Composer Architecture

## Principle

Do not shrink the desktop composer. Introduce a responsive **mobile-primary** composition model when `isMobile && !compact`.

## Target structure

```
Conversation Screen
├── Compact Header
├── Message History (flex-1 min-h-0)
├── Optional Context Strip (collapsed while typing/keyboard)
└── Mobile Composer (shrink-0, safe-area)
    ├── Attachment staging
    ├── Optional Suggest chip (human, idle only)
    ├── Input row
    │   ├── Plus (Files / Media / Camera sheet)
    │   ├── Expanding textarea (dominant, min-w-0)
    │   └── Contextual trailing: Mic XOR Send
    └── Optional helper (hidden when keyboard open)
```

## Idle vs draft

| State | Trailing control |
|---|---|
| Empty, no attachment, voice available | Microphone |
| Text or attachment staged / sending | Send (compact icon) |

Suggest Reply is **not** a permanent primary-row control on mobile.

## Key modules

| File | Role |
|---|---|
| `geezle/src/components/messaging/SmartComposer.tsx` | `mobilePrimary` layout, bottom sheet, mic/send toggle |
| `geezle/src/messages/messagesWorkspaceLayout.ts` | Height bounds, short placeholders, history/composer class contracts |
| `geezle/src/messages/Messages.tsx` | visualViewport, keyboard collapse of Scrolitha chrome, header gender hide |

## Desktop preservation

When `!mobilePrimary`, desktop retains:

- Multi-control row with labeled Send
- Suggest Reply primary control
- Longer instructional placeholders where provided by parent
- Non-sheet attachment popover behavior

## Attachment launcher

Mobile: bottom sheet with Files, Media, Camera (safe-area, Escape/back, closes on selection).  
Desktop: popover panel adjacent to plus.

## Placeholders

| Context | Mobile |
|---|---|
| Human | `Message…` |
| Scrolitha | `Ask Scrolitha…` |
| Scrolitha + attachment | `Ask about this file…` |
| Human + attachment | `Add a caption…` |

Implemented by `mobileComposerPlaceholder()` in `messagesWorkspaceLayout.ts`.
