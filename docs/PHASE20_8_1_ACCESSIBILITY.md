# Phase 20.8.1 — Accessibility

## Mobile composer

| Control | Accessible name |
|---|---|
| Plus | Opens attachment options (Files, Media, Camera) |
| Textarea | Uses placeholder + existing label association |
| Mic | Voice control aria-label preserved |
| Send | Compact icon with aria-label on mobile |
| Suggest chip | Button with visible text / aria |
| Bottom sheet | Closes on Escape; selection closes sheet |

## Touch targets

Mobile primary controls use `h-11 w-11 min-h-[44px] min-w-[44px]`.

## Disclosure

AI disclosure remains available as compact one-line text while typing; full strip when idle.

## Known gaps

- Authenticated screen-reader walkthrough on physical device is **operator-pending**
- Bottom sheet focus trap is progressive (Escape + backdrop); full dialog role audit recommended in follow-up
