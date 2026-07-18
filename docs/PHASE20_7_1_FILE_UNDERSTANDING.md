# Phase 20.7.1 — File Understanding

## Scope

- Reuses messaging attachment authorization (owned files only).  
- MIME allowlist: text/*, PDF, DOCX, images.  
- Size bound 5MB understanding threshold.  
- Content treated as **untrusted** (`[UNTRUSTED_USER_ATTACHMENTS]`).

## Status

**Limited:** metadata + safety framing only in this phase. Full PDF/DOCX text extractors are not inlined (no storage path exposure to the model). Image OCR not claimed.

## Flag

`SCROLITHA_ROLLOUT_FILE_UNDERSTANDING`
