# Phase 20.7.2 — Feature Flag Truth Table

Effective production values after recovery deploy:

| Flag | Value | Notes |
|---|---|---|
| MASTER | true | public AI master |
| MESSAGING_ASSISTANT | true | basic DM assistant ON |
| STREAMING (provider abs.) | true | not messagingStream |
| ACTION_CARDS | true | legacy action plans |
| INTERNAL_ROLLOUT | true | |
| CONVERSATION_UNIFICATION | unset/false | Messages path independent |
| MESSAGING_STREAM | unset/false | |
| RICH_ENTITY_CARDS | unset/false | |
| TOOL_EXECUTION | unset/false | |
| TOOL_WRITE_ACTIONS | unset/false | writes blocked |
| CONFIRMATION_TOKENS | unset/false | |
| FILE_UNDERSTANDING | unset/false | |
| QUALITY_FEEDBACK | unset/false | |
| SCROLITHA_CORE_MODEL | qwen3:14b | set this phase |
| SCROLITHA_PROVIDER | core | set this phase |
| SCROLITHA_CORE_ENDPOINT | scrolitha-core… | pre-existing |

## Basic response invariant

Requires only MASTER + MESSAGING_ASSISTANT. Independent of all new 20.7.1 flags.
