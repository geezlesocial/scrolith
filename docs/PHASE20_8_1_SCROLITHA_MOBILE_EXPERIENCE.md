# Phase 20.8.1 — Scrolitha Mobile Experience

## Continuity

- Single official Scrolitha conversation identity preserved
- Prompt chips, AI disclosure, file-analysis via plus menu retained
- Thinking / streaming / retry / error states unchanged
- No auto-send of generated content

## Idle (mobile)

- Horizontal single-row prompt chips (`flex-nowrap overflow-x-auto`)
- Compact disclosure: `Scrolitha · AI assistant`
- Short placeholder: `Ask Scrolitha…`

## Typing or keyboard open

- Full chip strip collapsed
- Compact line: `AI · verify important details`
- Input dominates remaining width
- File analysis remains under plus → Files / Media / Camera

## Desktop

Unchanged multi-line disclosure and always-visible chips when parent renders them.

## Test evidence

Unit: collapse policy covered indirectly via mobile layout + Messages composition; Smart Composer mobile policy tests pass (see test report).
