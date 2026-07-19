# Phase 20.7.6 — Technical Design

## Secure flow

```
Authenticated user
 → attach/select file (Messages / SupportWidget)
 → Phase 20.6 upload (owned File row + storage key)
 → postMessage / scrolitha/turn with attachmentFileIds
 → ownership check (ownerId == actorId always)
 → MIME + magic-byte validation
 → bounded extract (text / PDF best-effort / DOCX / image meta)
 → [UNTRUSTED_USER_ATTACHMENTS] framing
 → scrolithaChat orchestration
 → grounded assistant DirectMessage
```

## Capability classes

| Class | Implementation |
|---|---|
| A Images | Metadata + honest partial note (no false OCR claim when vision unavailable) |
| B PDF | Best-effort text extract; page hints; scanned detection |
| C Documents | TXT/MD/CSV/JSON/HTML strip; DOCX via ZIP+document.xml |
| D Multi-file | Max 3–5 files; gated by `SCROLITHA_FILE_MULTI` |

## Flags

| Env | Default | Purpose |
|---|---|---|
| `SCROLITHA_ROLLOUT_FILE_UNDERSTANDING` | false | Master gate |
| `SCROLITHA_FILE_TEXT` | false | Plain text |
| `SCROLITHA_FILE_PDF` | false | Text PDF |
| `SCROLITHA_FILE_IMAGES` | false | Image meta path |
| `SCROLITHA_FILE_SCANNED_PDF` | false | Scanned PDF path |
| `SCROLITHA_FILE_DOCX` | false | DOCX |
| `SCROLITHA_FILE_MULTI` | false | Multi-file compare |
| `SCROLITHA_FILE_MAX_BYTES` | 8MB | Size bound |
| `SCROLITHA_FILE_MAX_COUNT` | 3 | File count |
| `SCROLITHA_FILE_MAX_EXTRACT_CHARS` | 12000 | Extract bound |
| `SCROLITHA_FILE_MAX_PDF_PAGES` | 20 | Page hint bound |

## Provider model

- Provider: `SCROLITHA_PROVIDER=core` → Ollama `qwen3:14b`
- Model receives **extracted text excerpts only**, never bucket paths, tokens, or permanent URLs
- Image vision not claimed unless a vision-capable provider is later certified
