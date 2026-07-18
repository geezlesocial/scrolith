# Phase 20.7.1 — Rich Cards Report

## Schema

`ScrolithaEntityCard` v1: type, id, entityId, title, summary, metadata, actions, deepLink, imageUrl, accessibilityLabel.

Types: job, freelancer, employer, profile, marketplace, community, company, resume, notification, contract, project, wallet, post_draft, navigation, confirmation, error, unknown.

## Rendering

- Backend: `scrolitha.cards.ts` builders + normalizer
- Frontend: `ScrolithaEntityCards.tsx` (trusted React only)
- Messages bubble: renders `metadata.cards` for Scrolitha messages when present

## Flag

`SCROLITHA_ROLLOUT_RICH_ENTITY_CARDS` — when false, no cards attached to assistant metadata.
