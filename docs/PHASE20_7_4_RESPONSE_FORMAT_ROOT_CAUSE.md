# Phase 20.7.4 — Response Format Root Cause

## Baseline

- BE `scrolith-backend-00126-deh` (p2073)  
- FE `scrolith-frontend-00155-goh` (p2074)

## Why raw `**` appeared

| Stage | Behavior |
|---|---|
| Intent templates | Included Markdown emphasis: `**Scrolitha**`, `**remote**`, etc. |
| Sanitizer (20.7.3) | Removed internal metadata but **did not** strip Markdown |
| DirectMessage body | Stored with `**` intact |
| Messages UI | Renders `msg.text` as plain text in `<p>{msg.text}</p>` |
| SupportWidget | Uses `plainTextToHtml`, which *would* convert `**` to `<strong>` |

**Root cause:** Backend plain/Markdown mixed contract — templates used Markdown, Messages rendered plain text, so users saw literal asterisks. SupportWidget would have looked different (bold), confirming the multi-surface inconsistency.

## Contract decision

**Option A — plain text** for ordinary conversational Scrolitha replies.

Rationale: Messages/Dock path is plain text; wrappers share web shell; markdown-on-request still allowed via explicit user ask.
