# Phase 20.7.4 — Markdown Normalization

## Module

`geezle-backend/src/services/scrolitha/scrolitha.responseFormat.ts`

## Rules

| Input | Output |
|---|---|
| `**bold**` | bold |
| `__x__` | x |
| `*italic*` (paired) | italic |
| `[label](url)` | label (url) or label |
| `# heading` | heading |
| `- item` | • item |
| ``` code ``` | code content without fences |
| Bare `2 * 3` | preserved |

## Frontend mirror

`geezle/src/utils/scrolithaDisplayText.ts` for historical Scrolitha messages in Messages.
