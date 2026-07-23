# Database Migrations — Messaging Appearance & Pins

## Migration: `20260723150000_messaging_appearance_pins`

**Type:** Additive / non-destructive  
**Rollback:** Drop columns only if operator explicitly requires (not recommended while clients write them).

### SQL

```sql
ALTER TABLE "ConversationParticipant"
  ADD COLUMN IF NOT EXISTS "chatAppearanceJson" JSONB;

ALTER TABLE "ConversationSettings"
  ADD COLUMN IF NOT EXISTS "pinPolicy" TEXT NOT NULL DEFAULT 'OWNER_ADMIN';
```

### Prisma models

- `ConversationParticipant.chatAppearanceJson Json?`
- `ConversationSettings.pinPolicy String @default("OWNER_ADMIN")`

### Pre-existing (Phase 29.1, not recreated here)

- `Conversation.avatarFileId`
- `ConversationPinnedMessage` table (`pinnedById`, `rank`, unique conversation+message)

## Safety rules

- No column drops
- No table drops
- No destructive type changes
- Defaults preserve existing groups/DMs behavior
- Clients tolerate missing appearance JSON (default `kind: none`)

## Apply

```bash
# From geezle-backend, using existing deploy/migrate practices
npx prisma migrate deploy
# or project-approved Cloud SQL migrate job
```

## Verification

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ConversationParticipant' AND column_name = 'chatAppearanceJson';

SELECT column_name, column_default
FROM information_schema.columns
WHERE table_name = 'ConversationSettings' AND column_name = 'pinPolicy';
```
