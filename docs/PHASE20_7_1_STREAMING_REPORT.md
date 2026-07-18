# Phase 20.7.1 — Streaming Report

## Contract

`StreamEvent`: start | chunk | done | error | cancelled  
`streamingMode`: token | chunk_fallback | none

## Messaging integration

- Flag: `SCROLITHA_ROLLOUT_MESSAGING_STREAM` (`messagingStream`)
- SSE: `POST /api/messages/scrolitha/turn/stream`
- Socket: `scrolitha:stream`
- Persistence: single final assistant message only

## Tests

Unit coverage for confirmation/cards/tools (phase2071.spec). Streaming unit path reuses `chunkAnswerForIncrementalRender`.

## Limitation

True token streaming from Ollama is not wired as default production path; chunk_fallback is the certified mode for 20.7.1.
