# Phase 33.1 — AI Composer

## Component

`geezle/src/components/ai/AIComposerAssist.tsx`

## Modes

Improve, Expand, Shorten, Professional, Friendly, Formal, Casual, Grammar, Spelling, Hashtags, Emoji.

## Surfaces (prop)

`post` | `comment` | `message` | `community` | `business` | `generic`

## Behavior

1. User clicks **Generate draft**  
2. Calls `POST /api/ai/assistant/composer`  
3. Preview shown  
4. User must **Apply to editor** or **Copy**  
5. **Never auto-submits** the host form  

## API

```json
POST /api/ai/assistant/composer
{ "text": "...", "mode": "improve", "surface": "post", "locale": "en" }
```
