# Phase 20.8.1 — Performance

## Bundle

- Frontend-only UI change within existing Messages / SmartComposer modules
- No new heavy dependencies
- No backend bundle impact

## Runtime

| Concern | Impact |
|---|---|
| visualViewport listeners | Existing pattern; light resize/scroll handlers |
| Composer height recompute | On input + keyboard inset change only |
| Bottom sheet | Mounted when open; closed on keyboard open |
| Prompt strip collapse | Conditional render; reduces DOM while typing |

## Layout thrash

Height clamp and `min-w-0` reduce reflow from multi-control squeeze. Keyboard open shrinks max textarea height (96px) to leave history room.

## Build

Image `scrolith-frontend:p2082-mobile` — Cloud Build SUCCESS `8700188b-e582-4956-8756-da0309d3d996`.
