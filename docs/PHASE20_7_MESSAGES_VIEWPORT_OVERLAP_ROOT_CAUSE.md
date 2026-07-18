# Phase 20.7 — Messages Viewport / Composer Overlap Root Cause

**Severity:** P1 layout regression inside dedicated `/messages` workspace  
**Distinct from:** floating Messaging Dock overlay (fixed in p2071 / PR #83)

## Root cause

Three cooperating layout defects in `Messages.tsx`:

1. **Message history flex item lacked `min-h-0`**  
   With `flex-1` alone, the default `min-height: auto` prevents shrinking below content height, so the list expands instead of scrolling.

2. **Desktop composer used `sticky bottom-0`**  
   Sticky positioning inside a flex column competes with the history viewport and can paint over message bubbles when the column overflows.

3. **Scrolitha chrome was vertically heavy**  
   Desktop textarea min-height ~108px plus multi-row `flex-wrap` prompt chips consumed a large share of limited viewport height, clipping history under the header/composer.

## Component hierarchy (before)

```
layoutShell (md:h calc 100vh-64px)
└─ rounded card h-full
   └─ flex row
      ├─ sidebar flex-col
      └─ conversation panel flex-col flex-1 min-h-0
         ├─ header sticky top-0
         ├─ history flex-1 overflow-y-auto  ← missing min-h-0
         └─ composer sticky bottom-0        ← overlay risk
              ├─ chips flex-wrap            ← tall
              └─ textarea min ~108px
```

## Fix principle

Flex-column ownership:

- header `shrink-0` (not sticky)
- history `flex-1 min-h-0 overflow-y-auto`
- composer `shrink-0` (not sticky/fixed)
- chips single-row horizontal scroll
- compact textarea bounds (52–168px desktop)
