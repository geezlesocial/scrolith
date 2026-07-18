# Phase 20.7.1 — Platform Tools Report

See also `PHASE20_7_1_CAPABILITY_INVENTORY.md`.

## Activation gates (`isToolActivationAllowed`)

| Risk | Requirements |
|---|---|
| read_only | toolExecution OR (messagingSafe + messaging surface) |
| draft | toolExecution + toolWriteActions |
| write | toolExecution + toolWriteActions |
| destructive | toolExecution + toolWriteActions + confirmation |
| administrative | admin + toolExecution |

## Production readiness notes

- Read-only self-scoped tools are production-ready when flags allow.
- Draft tools create DRAFT entities (not public publish).
- Write/destructive remain gated off by default (`toolWriteActions=false`).
- Admin tools never exposed to ordinary users.
