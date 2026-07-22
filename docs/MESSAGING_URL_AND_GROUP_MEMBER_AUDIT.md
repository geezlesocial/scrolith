# Messaging URL and Group Member Audit

Date: 2026-07-23

## Messaging Inventory

- Message storage: `geezle-backend/prisma/schema.prisma` stores direct and group chat messages in `DirectMessage.text`; no migration is required for historical messages.
- Message API: `geezle-backend/src/routes/messages.routes.ts` and `geezle-backend/src/controllers/messages.controller.ts`.
- Message serializer: `buildConversationPayload` and frontend `normalizeMessage` in `geezle/src/services/messaging.ts`.
- Full message rendering: `geezle/src/messages/Messages.tsx`.
- Desktop dock rendering: `geezle/src/components/messaging/MessagingChatWindow.tsx`.
- Group message rendering: same conversation renderer as direct messages, differentiated by conversation type.
- Scrolitha conversation rendering: same `Messages.tsx` renderer; Scrolitha text is normalized before link tokenization.
- Attachment rendering: `geezle/src/components/messaging/MessageAttachmentRenderer.tsx`.
- Android/Capacitor link handling: Capacitor Browser is available through `@capacitor/browser`; external message links now use it on native runtime.
- Existing mention utility: `geezle/src/utils/messageMentions.ts`.
- Existing navigation: React Router `navigate` on messaging surfaces.

## Group Membership Inventory

- Member model: `ConversationParticipant` with unique `(conversationId, userId)`.
- Group member API: `geezle-backend/src/controllers/groupMessaging.controller.ts`.
- Routes: `geezle-backend/src/routes/messages.routes.ts`.
- Group settings UI: `geezle/src/components/messaging/GroupManagePanel.tsx`.
- Owner/admin policy: `canManageMembers` in `geezle-backend/src/services/messaging/groupPolicy.ts`.
- Privacy policy: `canInviteToGroup` in `geezle-backend/src/services/messaging/messagingPrivacyPolicy.ts`.
- Block model: `UserBlock` in Prisma schema.
- Group audit: `recordGroupAudit` in `geezle-backend/src/services/messaging/groupAudit.ts`.
- Notifications: existing `Notification` table; member add creates an in-app notification.

## Index Review

- `User.id`: primary key.
- `User.email`: unique.
- `User.username`: unique.
- `ConversationParticipant(conversationId, userId)`: unique.

Migration required: no.

