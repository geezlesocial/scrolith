# Phase 32.4 — Template Management

## Model

`NotificationOpsTemplate`

- key · name · channel (`email` | `push` | `in_app`) · locale  
- subject / title / body / htmlBody  
- variables JSON  
- version · status (`draft` | `published` | `archived`)  
- previousVersionId for rollback  

## Features

| Feature | Support |
|---------|---------|
| Create / edit | Yes |
| Preview with variables | Yes (`{{name}}` style) |
| Version history | Yes (new version create) |
| Localization | locale field |
| Publish | status + publishedAt |
| Rollback | restore previousVersionId |
| Safe HTML | HTML escaped in preview |

## Variables

Use `{{variableName}}` placeholders. Preview API accepts `{ variables: { name: "Alex" } }`.

## Endpoints

- `GET /ops/templates`  
- `POST /ops/templates`  
- `PATCH /ops/templates/:id`  
- `POST /ops/templates/:id/publish`  
- `POST /ops/templates/:id/rollback`  
- `POST /ops/templates/:id/preview`  
- `GET /ops/templates/history/:key`  

## Relation to Journey Center

Journey Center retains its own `journeys/templates` for multi-step flows. Ops templates are for Notification Center operational content and versioned multi-channel messages.
