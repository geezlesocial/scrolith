# Phase 33.1 — Prompt Library

Curated, versioned **user templates** (not arbitrary system prompts).

## Categories

Professional, Business, Education, Marketing, Community, Freelancing, Recruitment, Productivity.

## Implementation

`geezle-backend/src/services/scrolithaAi/promptLibrary.ts`

Templates use `{{topic}}` and map to draft kinds or chat.

## API

- `GET /api/ai/assistant/prompts?category=&q=`  
- `POST /api/ai/assistant/prompts/:id/use` `{ topic }`
