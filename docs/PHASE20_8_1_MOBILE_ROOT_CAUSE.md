# Phase 20.8.1 — Mobile Root Cause Report

**Date:** 2026-07-19  
**Severity:** P1 Mobile UX regression  
**Production baseline (pre-fix):** FE `scrolith-frontend-00169-wob` (tag `p2081`, image `scrolith-frontend:p2081-11acf8be`)  
**Backend (unchanged):** `scrolith-backend-00138-zan` (tag `p2079`, image `scrolith-backend:p2079-3de89a3d`)

## Observed defects (narrow Android viewport)

| # | Defect |
|---|---|
| 1 | Textarea extremely narrow |
| 2 | Desktop placeholder wraps into many vertical lines |
| 3 | Plus, mic, Suggest Reply, Send compete for width |
| 4 | Composer height excessive when empty |
| 5 | Software keyboard compresses conversation history |
| 6 | Prompt suggestions remain expanded while typing |
| 7 | AI disclosure / helper text permanent full rows |
| 8 | Header identity truncated; gender badge consumes width |
| 9 | Mobile inherits desktop multi-control layout |

## Component hierarchy audited

```
Messages.tsx (workspace shell)
├── Mobile inbox list | Conversation pane
│   ├── Compact/desktop header
│   ├── Message history (flex-1 min-h-0 scroll)
│   ├── Scrolitha prompt strip + AI disclosure
│   └── Composer region (shrink-0)
│       └── SmartComposer.tsx
│           ├── Suggest chip (post-fix mobile only)
│           ├── Primary row: + | textarea | trailing
│           ├── Desktop: + | textarea | mic | Suggest | Send
│           ├── Bottom sheet (mobile Files/Media/Camera)
│           └── Helper / privacy text
```

## Answers to mandatory questions

| # | Question | Finding |
|---|---|---|
| 1 | Why is textarea restricted? | Four fixed-width trailing controls + plus forced remaining width near zero under ~360px. |
| 2 | Desktop multi-column on mobile? | Yes — same primary row control set as desktop after Phase 20.8. |
| 3 | All actions one row? | Yes on mobile before 20.8.1. |
| 4 | Send fixed large width? | Desktop used `min-w-[5.5rem]` with “Send” label always visible. |
| 5 | Suggest permanent primary? | Yes — always rendered beside textarea when `showSuggestReply`. |
| 6 | Helper always while keyboard? | Yes — helperText row always rendered. |
| 7 | Prompt chips while typing? | Yes — Scrolitha strip always expanded. |
| 8 | Fixed/min height unsuitable? | Desktop min ~52px + multi-row chrome stacked above input. |
| 9 | Layout vs visual viewport? | Partial: visualViewport used but chrome not collapsed on keyboard. |
| 10 | Android browser vs wrapper? | Same SPA; WebView and Chrome both suffer width pressure + keyboard inset. |
| 11 | Address bar counted wrong? | Mitigated via `visualViewport.height` + shell-top offset; residual risk if host chrome changes. |
| 12 | `min-width: 0` missing? | Partial — input needed explicit `min-w-0` + flex-1 dominance; fixed in 20.8.1. |

## Root cause (precise)

Phase 20.8 introduced a desktop-first Smart Composer primary row:

`[+] [textarea] [mic] [Suggest] [Send]`

On viewports &lt; 768px this row was reused without progressive disclosure. Fixed 40–44px controls (×4) plus padding left the textarea as a residual column, which wrapped the long desktop placeholder and inflated composer height. Scrolitha chrome and gender metadata further reduced history height. This is a **frontend responsive layout defect**, not an API/socket/persistence defect.

## Fix direction (implemented)

Mobile-primary composition model (see `PHASE20_8_1_MOBILE_COMPOSER_ARCHITECTURE.md`):

- Primary: `[+] [flex-1 min-w-0 textarea] [mic XOR send]`
- Suggest as chip / plus menu item
- Short mobile placeholders
- Collapse Scrolitha chrome while typing or keyboard open
- Hide gender on compact mobile header/inbox chrome
- Tighten mobile textarea min/max under keyboard
