# Phase 20.8.1 — Executive Summary

## Result

**COMPLETE — DEPLOYED, LIMITED VALIDATION**

Purpose-built mobile Smart Composer recovery for Scrolith Messages, preserving the Phase 20.8 desktop experience.

## Problem

On narrow Android viewports, the desktop multi-control Smart Composer squeezed the textarea, wrapped long placeholders, inflated composer height, and left conversation history unusable under the software keyboard.

## Solution

- Mobile primary row: `[+] [wide input] [mic XOR send]`
- Files / Media / Camera behind plus bottom sheet
- Suggest Reply as chip / menu (not permanent primary)
- Short mobile placeholders
- Collapse Scrolitha prompts and disclosure while typing or keyboard open
- Compact header without gender badge on mobile
- visualViewport-driven shell height + tighter keyboard textarea bounds

## Production

| Layer | Revision | Tag |
|---|---|---|
| Frontend (100%) | `scrolith-frontend-00171-yis` | p2082 |
| Backend (100%) | `scrolith-backend-00138-zan` | p2079 (unchanged) |

## Validation honesty

Automated unit tests and deploy smokes passed. Physical Android browser and Capacitor wrapper authenticated E2E are **operator-pending**. Rollback to p2081 remains one traffic command.

## Continuity

Phase 20.6 media, 20.7.x Scrolitha corrections, sockets, persistence, and desktop Smart Composer behaviors preserved. No messaging API or schema change.
