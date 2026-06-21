# Scrolith Wave 1 UI/API/Database Implementation Map

## 1. Purpose

This document maps Wave 1 backlog items to likely implementation surfaces in:

- UI
- frontend services
- backend APIs
- backend services
- database model
- admin control surfaces

This is a planning map, not a claim that all target files already exist for every feature. It is intended to help engineering choose where each Wave 1 feature should land.

## 2. Wave 1 Scope

Wave 1 includes:

- role-based verification badges
- delivery and reliability score
- live observability and diagnostics
- retry-safe reactions, comments, and writes
- convert chat thread to brief
- convert brief to proposal
- storefront tab on profiles
- public threaded Scroll comments

## 3. Implementation Map

## W1-1: Role-based verification badges

### UI surfaces

Recommended frontend targets:

- `geezle/src/components/common/VerifiedBadge.tsx`
- `geezle/src/profile/`
- `geezle/src/pages/CompanyPage.tsx`
- `geezle/src/features/scroll/ScrollCard.tsx`
- `geezle/src/features/live/LiveViewer.tsx`
- `geezle/src/components/PostComments.tsx`

### Frontend service layer

Recommended service surfaces:

- `geezle/src/services/user.ts`
- `geezle/src/services/admin.ts`
- `geezle/src/services/kyc.ts`

### Backend API

Recommended route/controller surfaces:

- `geezle-backend/src/routes/user.ts`
- `geezle-backend/src/routes/kyc.routes.ts`
- `geezle-backend/src/routes/admin/`
- `geezle-backend/src/controllers/`

### Backend service layer

Recommended services:

- verification service
- badge resolution service
- admin review service

### Database model

Recommended additions:

- extend `User` or related model with explicit verification state fields
- add `VerificationReview`
- add `BusinessVerification` if business verification needs separate lifecycle

### Admin UI

Recommended admin modules:

- `Users.tsx`
- `KYCVerification.tsx`
- `RoleManagement.tsx`

### Analytics events

- `verification_requested`
- `verification_approved`
- `verification_rejected`
- `verification_revoked`

## W1-2: Delivery and reliability score

### UI surfaces

Recommended frontend targets:

- profile summary card
- storefront merchant summary
- company page trust summary
- live host card

Likely files:

- `geezle/src/profile/`
- `geezle/src/pages/CompanyPage.tsx`
- `geezle/src/components/sections/MemberHomeSection.tsx`
- `geezle/src/components/insights/InsightsQuickPanel.tsx`

### Frontend service layer

- `geezle/src/services/user.ts`
- `geezle/src/services/insights.ts`
- `geezle/src/services/admin.ts`

### Backend API

- profile route extensions
- user summary endpoints
- admin scoring settings endpoint

### Backend service layer

- reliability score aggregation service
- trust weighting service

### Database model

Recommended approach:

- reuse and extend `ProfessionalScore` if suitable
- or add `TrustScoreSnapshot`
- derive from `Review`, `Order`, `Contract`, `Support`, and messaging signals

### Admin UI

- `InsightsGrowth.tsx`
- `Users.tsx`
- `SystemSettings.tsx`

### Analytics events

- `trust_score_recomputed`
- `trust_profile_viewed`

## W1-3: Live observability and diagnostics

### UI surfaces

Recommended frontend targets:

- `geezle/src/features/live/LiveViewer.tsx`
- `geezle/src/features/live/LiveStudio.tsx`
- `geezle/src/pages/AdminLivePlatform.tsx`

### Frontend service layer

- `geezle/src/services/live.ts`
- `geezle/src/context/SocketContext.tsx`

### Backend API

Recommended route/controller surfaces:

- `geezle-backend/src/routes/live.routes.ts`
- `geezle-backend/src/controllers/live.controller.ts`
- `geezle-backend/src/server.ts`

### Backend service layer

- live diagnostics recorder
- session trace service
- quality aggregation service

### Database model

Recommended additions:

- `LiveSessionTrace`
- `LiveSessionMetric`
- `LiveConnectionEvent`

### Admin UI

- `AdminLivePlatform.tsx`

### Analytics events

- `live_join_started`
- `live_join_failed`
- `live_host_publish_started`
- `live_host_publish_failed`
- `live_retry_triggered`

## W1-4: Retry-safe reactions, comments, and writes

### UI surfaces

Recommended frontend targets:

- `geezle/src/community/components/ReactionBar.tsx`
- `geezle/src/components/PostComments.tsx`
- `geezle/src/features/scroll/ScrollFeed.tsx`
- `geezle/src/features/scroll/ScrollCommentsSheet.tsx`

### Frontend service layer

- `geezle/src/services/reactions.ts`
- `geezle/src/services/community.ts`
- `geezle/src/services/scroll.ts`

### Backend API

- `geezle-backend/src/routes/reactions.routes.ts`
- `geezle-backend/src/routes/posts.routes.ts`
- `geezle-backend/src/routes/scroll.routes.ts`
- `geezle-backend/src/controllers/reactions.controller.ts`

### Backend service layer

- idempotency guard middleware or service
- client action replay protection

### Database model

Recommended additions:

- `ClientActionLog` with unique idempotency key
- unique constraints on reaction target per user where appropriate

### Admin UI

- `Overview.tsx`
- `CommunityManagement.tsx`
- `AdminLivePlatform.tsx` for live action errors if relevant

### Analytics events

- `social_action_submitted`
- `social_action_duplicate_blocked`
- `social_action_retry_succeeded`
- `social_action_retry_failed`

## W1-5: Convert chat thread to brief

### UI surfaces

Recommended frontend targets:

- `geezle/src/messages/`
- `geezle/src/dashboard/shared/MessagesPanel.tsx`
- brief creation modal or drawer

### Frontend service layer

- `geezle/src/services/messages.ts`
- `geezle/src/services/briefs.ts`

### Backend API

- `geezle-backend/src/routes/messages.routes.ts`
- `geezle-backend/src/routes/briefs.routes.ts`

### Backend service layer

- conversation-to-brief mapping service
- participant extraction helper

### Database model

Recommended additions:

- `BriefConversationLink`
- optional brief origin metadata fields

### Admin UI

- `Messages.tsx`
- `SystemSettings.tsx` for templates and policy

### Analytics events

- `brief_created_from_chat`
- `brief_chat_prefill_used`

## W1-6: Convert brief to proposal

### UI surfaces

Recommended frontend targets:

- brief detail page
- proposal creation flow
- proposal timeline card

### Frontend service layer

- `geezle/src/services/briefs.ts`
- `geezle/src/services/proposals.ts`

### Backend API

- `geezle-backend/src/routes/briefs.routes.ts`
- `geezle-backend/src/routes/proposals.routes.ts`

### Backend service layer

- brief-to-proposal service
- proposal history service

### Database model

Recommended additions:

- `ProposalBriefLink`
- brief origin fields on `Proposal` if that approach is preferred

### Admin UI

- `GigsJobs.tsx`
- `SystemSettings.tsx`

### Analytics events

- `proposal_created_from_brief`
- `proposal_brief_conversion_started`

## W1-7: Storefront tab on profiles

### UI surfaces

Recommended frontend targets:

- `geezle/src/profile/`
- `geezle/src/pages/CompanyPage.tsx`
- `geezle/src/components/sections/MemberHomeSection.tsx`

### Frontend service layer

- `geezle/src/services/profile.ts`
- `geezle/src/services/commerce.ts`
- possibly a new `storefront.ts`

### Backend API

Recommended routes:

- profile routes
- commerce routes
- new storefront routes if a dedicated service is introduced

### Backend service layer

- storefront service
- storefront item resolver
- public storefront summary service

### Database model

Recommended additions:

- `Storefront`
- `StorefrontItem`
- `StorefrontCollection`

### Admin UI

- `CommerceEngagement.tsx`
- `CommunityManagement.tsx`
- `SystemSettings.tsx`

### Analytics events

- `storefront_viewed`
- `storefront_item_clicked`
- `storefront_config_updated`

## W1-8: Public threaded Scroll comments

### UI surfaces

Recommended frontend targets:

- `geezle/src/features/scroll/ScrollCommentsSheet.tsx`
- `geezle/src/features/scroll/ScrollFeed.tsx`
- commenter identity card and reply composer

### Frontend service layer

- `geezle/src/services/scroll.ts`
- `geezle/src/services/reactions.ts`

### Backend API

- `geezle-backend/src/routes/scroll.routes.ts`
- `geezle-backend/src/controllers/scroll.controller.ts`

### Backend service layer

- scroll comments bundle loader
- reply threading service
- moderation state resolver

### Database model

Recommended approach:

- use `ScrollComment`
- support parent-child reply linkage
- store commenter identity references and moderation state

### Admin UI

- `ScrollAdminPanel`
- `CommunityManagement.tsx`

### Analytics events

- `scroll_comment_created`
- `scroll_reply_created`
- `scroll_comment_liked`
- `scroll_comment_reported`

## 4. Cross-Cutting Admin Controls for Wave 1

Each Wave 1 feature should ship with these admin capabilities:

- feature toggle
- policy and threshold settings
- moderation or approval surface
- analytics visibility
- audit trail where appropriate

Recommended shared admin homes:

- `SystemSettings.tsx`
- `CommunityManagement.tsx`
- `InsightsGrowth.tsx`
- `AdminLivePlatform.tsx`
- `Users.tsx`

## 5. Cross-Cutting QA Map for Wave 1

Every Wave 1 feature should be tested on:

- desktop web
- mobile web
- Android app shell
- admin dashboard where applicable

Every Wave 1 feature should also be tested for:

- authenticated and unauthenticated behavior
- retry and refresh behavior
- low-network conditions where relevant
- public visibility correctness

## 6. Wave 1 Release Strategy

Recommended release order:

1. verification badge model and admin review flow
2. retry-safe social actions
3. live diagnostics and admin health dashboard
4. trust score widget and aggregate logic
5. chat to brief flow
6. brief to proposal flow
7. storefront tab foundation
8. public threaded Scroll comments

## 7. Final Implementation Rule

Wave 1 should not be treated as eight isolated features.

It should be treated as one platform outcome:

Scrolith becomes more trustworthy, more stable, and more conversion-ready without sacrificing admin control.
