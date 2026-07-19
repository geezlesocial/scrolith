# Phase 20.7.6 — Test Report

## Automated

```
npx tsx --test \
  src/services/scrolitha/__tests__/scrolitha.phase2076.fileIntelligence.spec.ts \
  src/services/scrolitha/__tests__/scrolitha.phase2071.spec.ts
```

**Result: 18/18 PASS**

Coverage:

- MIME allowlist / reject executables & archives
- File-analysis intent heuristic
- Progressive flags default OFF
- PDF literal string extraction
- Scanned-PDF heuristic
- DOCX store-ZIP extraction
- Untrusted framing + injection content remains data
- Confirmation tokens / cards / tools regression (phase2071)

## Security unit checks

| Check | Result |
|---|---|
| PE/ELF/shebang reject path | covered via magic + MIME tests |
| Prompt injection framed as data | PASS |
| Flags default disabled | PASS |

## Operator E2E (post progressive enable)

Deferred until flags enabled for internal canary:

1. Attach TXT → summarize
2. Attach text PDF → key points + page honesty
3. Attach image → partial/meta honesty (no fake OCR)
4. No file + “review my resume” → selection prompt
5. Other-user file ID → no content
