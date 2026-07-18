# Phase 20.7.4 — Response Format Contract

## Canonical contract: plain user-facing prose

Ordinary Scrolitha replies are **plain text**:

- No Markdown emphasis markers (`**`, `__`, unpaired `*`)
- No HTML in the stored body
- Paragraphs separated by blank lines
- Bullets as `•` when needed
- Code fences only when user explicitly asks for code/Markdown

## Pipeline

1. Intent router / LLM produces content  
2. `sanitizeUserFacingReply` → internal strip  
3. `toCanonicalUserFacingProse` / `markdownToPlainProse`  
4. Persist plain body  
5. FE: Messages applies display-time strip for historical Scrolitha messages  
6. SupportWidget strips then paragraph-wraps via `plainTextToHtml`

## Exceptions

If user message matches “in markdown” / “code block”, preservations may keep fences.
