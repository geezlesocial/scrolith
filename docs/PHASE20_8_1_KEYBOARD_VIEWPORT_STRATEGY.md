# Phase 20.8.1 — Keyboard & Visual Viewport Strategy

## Goals

- Composer remains above software keyboard
- Message history resizes; no blank gap under composer
- No double compensation
- Prefer CSS; JS measurement only where required

## Measurement (Messages.tsx)

On mobile (`innerWidth < 768`):

```
visualViewport.height  → visible height
visualViewport.offsetTop → address-bar / scroll offset
keyboardInset = max(0, innerHeight - visibleHeight - offsetTop)
availableHeight = visibleHeight - shellTopOffset
```

State:

- `mobileKeyboardInset` — threshold `> 96` ⇒ keyboard considered open
- `mobileComposerHostHeight` — host shell height in px
- `mobileViewportTop` / `mobileViewportHeight`

Listeners: `visualViewport` resize/scroll + window resize.

## Composer height under keyboard

| Mode | Min (px) | Max (px) |
|---|---|---|
| Mobile idle | 44 | 120 |
| Mobile keyboard open | 40 | 96 |
| Desktop | 52 | 168 |

`computeComposerTextareaHeight({ scrollHeight, isMobile, keyboardOpen })`.

## Chrome collapse when keyboard open

- Scrolitha prompt strip → collapsed one-line disclosure
- Helper / privacy text → hidden (`showHelper = false` when mobilePrimary + keyboardOpen)
- Mobile bottom sheet closes if keyboard opens
- Suggest chip hidden when keyboard open or text present

## Safe area

Composer `paddingBottom: max(…, env(safe-area-inset-bottom))`.

## History behavior

- History keeps `min-h-0 flex-1 overflow-y-auto`
- When user was near bottom, scroll-into-view keeps latest reachable
- Does not force scroll to bottom if user is reading older messages (existing scroll ownership preserved)

## Residual risks

- Some Android WebViews report slightly different visualViewport during animation (possible 1-frame jump)
- iOS Safari not validated in this pass (Android-first P1)
