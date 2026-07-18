# Phase 20.7.4 — Frontend Rendering

| Surface | Strategy |
|---|---|
| Messages | Plain text bubble; `normalizeScrolithaDisplayText` for Scrolitha-authored msgs |
| Messaging Dock | Shares MessageContext / same message bodies → same plain text |
| SupportWidget | Strip Markdown then `plainTextToHtml` (paragraphs/links only) |
| Android / Desktop wrappers | Web shell inherits Messages + SupportWidget |

Human messages are not rewritten.
