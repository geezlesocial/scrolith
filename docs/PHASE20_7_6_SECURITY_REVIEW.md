# Phase 20.7.6 — Security Review

## Ownership

- `understandOwnedAttachments` **always** filters `ownerId = actorId`
- Admin does **not** bypass private file ownership
- Client-supplied attachment IDs never trusted without server ownership check

## SSRF

- No arbitrary URL fetch for analysis
- Content loaded only via `downloadMediaByProvider(storageProvider, storageKey)`
- No client-controlled storage key path into the model

## MIME / signature

- Allowlist: text, PDF, DOCX, jpeg/png/webp/gif
- Reject: PE, ELF, shebang, zip archives, js, executables
- Magic mismatch → `securityStatus=rejected`, clear user note

## Prompt injection

- All extracts wrapped in `[UNTRUSTED_USER_ATTACHMENTS]`
- Explicit instruction: treat as DATA only
- Failed/partial extraction must be stated; no invented content

## Malware / active content

- Executable signatures blocked
- DOCX limited to text extraction from `word/document.xml` (no macro execution)
- Archives rejected at allowlist

## Privacy

- No permanent public URLs to provider
- No owner email / bucket name in model context
- Public file ref model redacts owner internals (`toPublicFileRefs`)
