# Geezle Enterprise Backlog
## Multi-Reactions + Message Reply + Member Home Upgrade

This backlog is mapped to the current codebase in:
- Frontend: `c:\Projects\geezle`
- Backend: `c:\Projects\geezle-backend`

## Guardrails
- Do not change auth/session/token mechanics in:
  - `geezle-backend/src/middleware/auth.middleware.ts`
  - `geezle/src/context/UserContext.tsx`
  - `geezle/src/services/authService.ts`
- Do not change payment/KYC flows except read-only integration.
- Extend existing sockets and notifications; do not replace.
- Keep backward compatibility for current endpoints and payload shapes.

## Delivery Order
1. Settings foundation (admin-controlled feature flags)
2. Backend reaction engine (universal + permissions + rate limit)
3. Frontend reaction component + posts/comments integration
4. Messaging reply-to + message reactions upgrade
5. Member home enterprise UI uplift
6. Realtime/caching hardening
7. QA automation + demo artifacts

---

## Epic A: Settings Foundation

### A1. Add settings schema for reactions/member_home controls
- Estimate: 0.5 day
- Depends on: none
- Backend targets:
  - `geezle-backend/src/routes/admin/index.ts`
  - `geezle-backend/src/controllers/admin.systemSettings.controller.ts`
  - `geezle-backend/data/platform-system-settings.json` (fallback persistence format)
- Frontend targets:
  - `geezle/src/services/admin.ts`
  - `geezle/src/context/ContentContext.tsx`
- Acceptance:
  - `GET /api/admin/platform/settings` returns new keys:
    - `reactions.enabled`
    - `reactions.postsEnabled`
    - `reactions.commentsEnabled`
    - `reactions.messagesEnabled`
    - `reactions.allowed[]`
    - `reactions.showReactors`
    - `memberHome.widgets.*`
    - `memberHome.feed.*`
  - `POST /api/admin/platform/settings` persists keys and emits `settings:updated`.

### A2. Add admin UI controls in Homepage Settings
- Estimate: 1 day
- Depends on: A1
- Frontend targets:
  - `geezle/src/dashboard/admin/HomepageSettings.tsx`
  - `geezle/src/services/admin.ts`
- Acceptance:
  - New "Reactions and Engagement" section (global + per-surface toggles + allowed list editor).
  - New "Member Home Layout" section (widgets, sort, counts visibility).
  - Save updates immediately and reflects after refresh.

---

## Epic B: Backend Reactions Engine

### B1. Add universal reaction tables and message reply fields
- Estimate: 1 day
- Depends on: A1
- Backend targets:
  - `geezle-backend/prisma/schema.prisma`
  - `geezle-backend/prisma/migrations/*` (new migration)
- Changes:
  - Add `Reaction` model with unique `(userId, targetType, targetId)`.
  - Add `ReactionTargetType` enum: `POST`, `COMMENT`, `MESSAGE`.
  - Add `replyToMessageId` (+ optional `replyToSnapshot`) to `DirectMessage`.
  - Keep existing `CommunityPostReaction`/`MessageReaction` temporarily for compatibility migration.
- Acceptance:
  - Migration applies cleanly.
  - Existing reads/writes continue functioning before switch-over.

### B2. Implement universal reactions API
- Estimate: 1.5 days
- Depends on: B1
- Backend targets:
  - New: `geezle-backend/src/controllers/reactions.controller.ts`
  - New: `geezle-backend/src/routes/reactions.routes.ts`
  - Mount in: `geezle-backend/src/server.ts`
  - Reuse visibility rules from: `geezle-backend/src/controllers/community.controller.ts`, `geezle-backend/src/controllers/messages.controller.ts`
- Endpoints:
  - `POST /api/reactions`
  - `GET /api/reactions/summary`
  - `GET /api/reactions/users` (guarded by settings)
- Acceptance:
  - One reaction per user per target.
  - Same key toggles off; different key replaces.
  - Rejected when reaction key disabled by admin settings.
  - Permission checks enforced for post/comment/message visibility.

### B3. Wire reaction summary into post/comment/message payloads
- Estimate: 1 day
- Depends on: B2
- Backend targets:
  - `geezle-backend/src/controllers/community.controller.ts`
  - `geezle-backend/src/controllers/messages.controller.ts`
- Acceptance:
  - Post list/feed/single post include per-target reaction summary + viewer reaction.
  - Post comments include same summary shape.
  - Conversation messages include reaction summary + viewer reaction.

### B4. Realtime events for reactions
- Estimate: 0.5 day
- Depends on: B2
- Backend targets:
  - `geezle-backend/src/controllers/reactions.controller.ts`
  - `geezle-backend/src/realtime/socket.ts`
  - `geezle-backend/src/server.ts` (namespace emit helpers if needed)
- Events:
  - `reactions:updated` `{ targetType, targetId, counts, userReaction }`
- Acceptance:
  - Two active clients see reaction changes without refresh.

---

## Epic C: Frontend Reaction Component and Integration

### C1. Build reusable `ReactionBar`
- Estimate: 1 day
- Depends on: A2, B2
- Frontend targets:
  - New: `geezle/src/components/ReactionBar.tsx`
  - New: `geezle/src/services/reactions.ts`
  - Types: `geezle/src/types.ts`
- Acceptance:
  - Supports allowed reaction set from settings.
  - Highlights viewer reaction.
  - Supports toggle/change with optimistic update + rollback.
  - Supports disabled state from settings.

### C2. Integrate in post cards and comments
- Estimate: 1 day
- Depends on: C1, B3
- Frontend targets:
  - `geezle/src/components/sections/MemberHomeSection.tsx`
  - `geezle/src/community/CommunityHome.tsx`
  - `geezle/src/components/PostComments.tsx`
  - `geezle/src/components/InteractionBar.tsx` (decompose/replace like-only behavior)
- Acceptance:
  - Posts/comments show multi-reactions instead of like-only.
  - Admin toggles can hide or disable UI instantly.
  - Existing comment/post actions still work.

### C3. Socket-driven reaction cache updates
- Estimate: 0.5 day
- Depends on: C1, B4
- Frontend targets:
  - `geezle/src/context/SocketContext.tsx`
  - `geezle/src/community/followState.ts` (or new engagement store)
  - `geezle/src/messages/Messages.tsx`
- Acceptance:
  - `reactions:updated` mutates visible cards/messages without full reload.

---

## Epic D: Messaging Reply-To and Message Reactions

### D1. Backend support for `replyToMessageId`
- Estimate: 1 day
- Depends on: B1
- Backend targets:
  - `geezle-backend/src/controllers/messages.controller.ts`
  - `geezle-backend/src/routes/messages.routes.ts`
- Changes:
  - Extend send payload to accept `replyToMessageId`.
  - Validate replied message exists in same conversation.
  - Return reply preview metadata in message payload.
- Acceptance:
  - Message send with reply works and persists.
  - Invalid cross-conversation reply is rejected.

### D2. Frontend reply UX in inbox
- Estimate: 1 day
- Depends on: D1
- Frontend targets:
  - `geezle/src/messages/Messages.tsx`
  - `geezle/src/services/messaging.ts`
  - `geezle/src/types.ts`
- UX:
  - "Reply" action on bubble.
  - Composer reply preview + cancel.
  - Render quoted preview in sent message.
  - Click quote scrolls to original.
  - If original missing/deleted -> "Message unavailable".
- Acceptance:
  - Works for text and attachment messages.

### D3. Replace message emoji toggles with universal reactions API
- Estimate: 0.75 day
- Depends on: B2, C1
- Frontend targets:
  - `geezle/src/messages/Messages.tsx`
  - `geezle/src/services/messaging.ts`
  - `geezle/src/components/ReactionBar.tsx`
- Backend targets:
  - Deprecate path logic in `geezle-backend/src/controllers/messages.controller.ts` `toggleReaction`.
- Acceptance:
  - Message reactions follow one-reaction-per-user-per-message rule.

---

## Epic E: Member Home Enterprise UI Uplift

### E1. Layout/systemized sections upgrade
- Estimate: 1.5 days
- Depends on: A2
- Frontend targets:
  - `geezle/src/components/sections/MemberHomeSection.tsx`
  - `geezle/src/community/CommunityHome.tsx`
  - `geezle/src/main/Landing.tsx`
  - `geezle/src/index.css` (tokens/utilities if needed)
- Scope:
  - Cleaner card hierarchy, spacing, typography, responsive structure.
  - Desktop: feed + right rail; mobile: stacked/collapsible.
  - Skeleton loading for feed/widgets.
- Acceptance:
  - No overlap/CLS issues.
  - Settings-driven widget toggles respected.

### E2. Feed behavior controls from admin settings
- Estimate: 0.75 day
- Depends on: E1, A1/A2
- Frontend targets:
  - `geezle/src/components/sections/MemberHomeSection.tsx`
  - `geezle/src/community/CommunityHome.tsx`
  - `geezle/src/context/ContentContext.tsx`
- Acceptance:
  - Honors `defaultSort`, `showReactionCounts`, `showCommentPreviewCount`, widget toggles.

---

## Epic F: Hardening and Regression Protection

### F1. Add API/integration tests (backend)
- Estimate: 1 day
- Depends on: B2, D1
- Backend targets:
  - New tests under `geezle-backend/src/__tests__/integration/`
  - Extend `geezle-backend/src/__tests__/integration/socket.integration.test.ts`
- Required cases:
  - Reaction add/change/remove per target.
  - Permission rejection cases.
  - Reply-to-message validation and deleted-original display behavior.

### F2. Add UI E2E tests (frontend)
- Estimate: 1 day
- Depends on: C2, D2, E1
- Frontend targets:
  - New Cypress specs under `geezle/cypress/e2e/`
    - `community-reactions.cy.ts`
    - `messages-reply.cy.ts`
    - `member-home-layout.cy.ts`
- Required cases:
  - Two-browser realtime reaction sync.
  - Admin toggles disable reaction UI.
  - Reply jump-to-original behavior.

### F3. Performance and safety pass
- Estimate: 0.5 day
- Depends on: all implementation epics
- Targets:
  - `geezle/src/messages/Messages.tsx`
  - `geezle/src/components/sections/MemberHomeSection.tsx`
  - `geezle/src/community/CommunityHome.tsx`
- Acceptance:
  - No max update depth loops.
  - No duplicate socket listeners.
  - Stable render timings under high message volume.

---

## Story Point Summary (suggested)
- Epic A: 1.5 days
- Epic B: 4.0 days
- Epic C: 2.5 days
- Epic D: 2.75 days
- Epic E: 2.25 days
- Epic F: 2.5 days
- Total: ~15.5 engineer-days

## Parallelization Plan
- Backend engineer:
  - A1, B1, B2, B3, B4, D1, F1
- Frontend engineer:
  - A2, C1, C2, C3, D2, D3, E1, E2, F2, F3
- Sync points:
  - after B2 (API contract freeze)
  - after D1 (message reply payload freeze)
  - before F2 (E2 completed)

## API Contract Freeze Checklist
- Freeze before frontend integration:
  - `/api/reactions` request/response
  - `/api/reactions/summary`
  - `/api/reactions/users`
  - message send payload with `replyToMessageId`
  - message payload `replyTo` shape

## Demo Acceptance Pack
- Capture one short video showing:
  - post reactions
  - comment reactions
  - message reactions
  - reply-to-message in inbox
  - admin toggle disabling reactions in real-time

