# Scrolith Feature-by-Feature Implementation Backlog

## 1. Purpose

This document converts the competitive roadmap into an execution backlog.

It is designed to answer:

- what should be built first
- how each major feature should be split
- what dependencies exist
- what admin controls must ship with each feature
- what "done" should mean at delivery level

This backlog is organized by:

- priority tier
- epic
- feature slice
- implementation notes

It is written for product, engineering, design, QA, and admin-operations planning.

## 2. Backlog Conventions

### Priority

- `P0`: must-do foundation work
- `P1`: high-impact growth and conversion work
- `P2`: strategic differentiation work
- `P3`: scale, governance, and optimization work

### Effort

- `S`: small
- `M`: medium
- `L`: large
- `XL`: very large / multi-phase

### Status recommendation

- `Now`: should enter execution immediately
- `Next`: should follow after current block
- `Later`: should not start until earlier dependencies are stable

## 3. P0 Backlog: Reliability and Trust Foundation

## EPIC P0-A: Unified Trust Graph

### P0-A1: Role-based verification badges

- Priority: `P0`
- Effort: `M`
- Status: `Now`
- Goal: show verified identity, seller, creator, and business trust states in profiles, cards, storefronts, Scroll, and LIVE
- Deliverables:
  - verification badge model
  - role-specific verification states
  - profile display logic
  - admin verification review UI
- Admin controls:
  - verification enable/disable
  - badge visibility by role
  - verification approval and revoke actions
- Dependencies:
  - existing user, KYC, role, and admin systems
- Acceptance:
  - verified states display correctly across public surfaces
  - admin can approve, reject, and revoke
  - public users only see allowed badge classes

### P0-A2: Delivery and reliability score

- Priority: `P0`
- Effort: `L`
- Status: `Now`
- Goal: create a visible trust score based on real platform behavior
- Deliverables:
  - completed jobs score
  - response-time score
  - cancellation score
  - dispute score
  - fulfillment and reliability summary widget
- Admin controls:
  - score weighting rules
  - thresholds for trust labels
  - public visibility toggles
- Dependencies:
  - contracts, orders, messages, disputes, reviews
- Acceptance:
  - trust score recomputes from recorded behavior
  - score appears on profile and commerce surfaces
  - admin can tune scoring weights without code changes

### P0-A3: Verified portfolio proof system

- Priority: `P0`
- Effort: `L`
- Status: `Now`
- Goal: let users attach proof-based evidence to portfolios and work claims
- Deliverables:
  - portfolio proof upload model
  - proof attestation workflow
  - proof verification states
  - public proof widgets
- Admin controls:
  - proof type policy
  - moderation and dispute handling
  - approved evidence categories
- Dependencies:
  - file uploads, profile, moderation
- Acceptance:
  - users can add and manage proof items
  - admins can verify or reject proof
  - proof state appears publicly where allowed

## EPIC P0-B: Platform Reliability Hardening

### P0-B1: Live observability and diagnostics

- Priority: `P0`
- Effort: `L`
- Status: `Now`
- Goal: make live failures measurable and traceable
- Deliverables:
  - connection-state telemetry
  - host/viewer session logs
  - retry cause tracking
  - admin live quality dashboard
- Admin controls:
  - trace retention settings
  - session diagnostics access
  - quality alert thresholds
- Dependencies:
  - live stack, websocket events, admin live module
- Acceptance:
  - each failed session has traceable states
  - admins can inspect session health
  - key failure reasons are grouped and measurable

### P0-B2: Retry-safe reactions, comments, and writes

- Priority: `P0`
- Effort: `M`
- Status: `Now`
- Goal: prevent duplicate or lost social actions under retries and poor connectivity
- Deliverables:
  - action idempotency tokens
  - duplicate-write prevention
  - client retry queue rules
  - backend write guards
- Admin controls:
  - duplicate-action incident reporting
  - error-rate dashboards
- Dependencies:
  - reactions, comments, Scroll, post interactions
- Acceptance:
  - retries do not create duplicate reactions or comments
  - network interruptions recover cleanly
  - action success states remain consistent across refresh

### P0-B3: Media upload resilience

- Priority: `P0`
- Effort: `M`
- Status: `Now`
- Goal: make uploads dependable across web and app
- Deliverables:
  - resumable upload path where possible
  - failure-state handling
  - size/type validation feedback
  - upload audit logs
- Admin controls:
  - allowed type matrix
  - max size policy
  - upload health reporting
- Dependencies:
  - file manager, comments, posts, stories, Scroll
- Acceptance:
  - uploads fail gracefully
  - users see actionable error state
  - admin can monitor failure categories

## 4. P1 Backlog: Unified Commerce Conversion Flows

## EPIC P1-A: Message to Brief to Contract

### P1-A1: Convert chat thread to brief

- Priority: `P1`
- Effort: `M`
- Status: `Now`
- Goal: turn a conversation into a structured business request
- Deliverables:
  - "Create brief from chat" action
  - extracted participants and context
  - brief edit and confirmation flow
- Admin controls:
  - template selection
  - brief category rules
- Dependencies:
  - messages, briefs, auth
- Acceptance:
  - user can create a brief without leaving conversation flow
  - chat context can prefill the brief

### P1-A2: Convert brief to proposal

- Priority: `P1`
- Effort: `M`
- Status: `Now`
- Goal: reduce the gap between demand creation and offer creation
- Deliverables:
  - proposal from brief action
  - brief-linked proposal history
  - proposal status timeline
- Admin controls:
  - default fields
  - proposal policy rules
- Dependencies:
  - briefs, proposals
- Acceptance:
  - proposal creation retains brief linkage
  - both parties can view progression history

### P1-A3: Convert proposal to contract

- Priority: `P1`
- Effort: `L`
- Status: `Now`
- Goal: remove the friction between agreement and transaction
- Deliverables:
  - proposal accept -> contract flow
  - milestone and payment schedule
  - contract summary in message thread
- Admin controls:
  - contract templates
  - milestone rules
  - fee policy
- Dependencies:
  - proposals, contracts, payments
- Acceptance:
  - accepted proposals can create contracts cleanly
  - milestone state is visible and trackable

### P1-A4: Timeline inside messaging

- Priority: `P1`
- Effort: `M`
- Status: `Next`
- Goal: keep users in one relationship context
- Deliverables:
  - timeline cards in chat
  - brief / proposal / contract / payment events
  - status chips and quick actions
- Admin controls:
  - timeline event visibility
- Dependencies:
  - P1-A1, P1-A2, P1-A3
- Acceptance:
  - users can follow deal state without navigating away

## EPIC P1-B: Profile-to-Storefront Commerce

### P1-B1: Storefront tab on profiles

- Priority: `P1`
- Effort: `L`
- Status: `Now`
- Goal: give every seller or creator a commerce-ready public surface
- Deliverables:
  - storefront tab on user and business profiles
  - featured products and services
  - merchant summary block
- Admin controls:
  - storefront enablement by role
  - allowed modules
- Dependencies:
  - profiles, business pages, products/services model
- Acceptance:
  - eligible users can configure storefront content
  - public visitors can browse storefront items

### P1-B2: Tag products and services in content

- Priority: `P1`
- Effort: `L`
- Status: `Now`
- Goal: let posts, Scroll, and LIVE become commerce surfaces
- Deliverables:
  - content tagging model
  - tagged offer overlays
  - one-tap path to storefront, DM, or brief
- Admin controls:
  - category restrictions
  - tagging permissions
  - moderation policy
- Dependencies:
  - storefront model, posts, Scroll, live
- Acceptance:
  - creators can tag eligible offers in content
  - viewers can act on tags without leaving context

### P1-B3: Pinned offers and featured collections

- Priority: `P1`
- Effort: `M`
- Status: `Next`
- Goal: improve conversion from profile and media visits
- Deliverables:
  - pinned offer slot
  - featured collection layout
  - storefront ordering controls
- Admin controls:
  - collection size limits
  - featured slot limits
- Dependencies:
  - storefront base model
- Acceptance:
  - sellers can curate their top offers
  - pinned items remain visible across supported surfaces

## EPIC P1-C: Social Distribution That Converts

### P1-C1: Repost with commentary

- Priority: `P1`
- Effort: `M`
- Status: `Now`
- Goal: make reposting a serious distribution tool
- Deliverables:
  - repost composer
  - attribution to original content
  - repost analytics
- Admin controls:
  - repost permissions
  - attribution policy
- Dependencies:
  - posts, Scroll, share model
- Acceptance:
  - repost keeps origin metadata
  - new commentary appears cleanly

### P1-C2: Share cards with attribution tracking

- Priority: `P1`
- Effort: `M`
- Status: `Next`
- Goal: measure outbound distribution and conversion
- Deliverables:
  - share links with campaign parameters
  - share card preview logic
  - click attribution
- Admin controls:
  - attribution window
  - allowed channel settings
- Dependencies:
  - share system, analytics
- Acceptance:
  - shared links retain source attribution
  - conversion from shared links is measurable

## 5. P1 Backlog: Creator Commerce and Storefronts

## EPIC P1-D: Affiliate Marketplace

### P1-D1: Seller campaign creation

- Priority: `P1`
- Effort: `L`
- Status: `Next`
- Goal: let sellers recruit creators for distribution
- Deliverables:
  - affiliate campaign setup
  - campaign goals and commission rules
  - campaign approval status
- Admin controls:
  - campaign review policy
  - commission caps
  - restricted categories
- Dependencies:
  - storefronts, user roles, payouts
- Acceptance:
  - sellers can create valid affiliate campaigns
  - campaigns can be reviewed and approved

### P1-D2: Creator affiliate discovery

- Priority: `P1`
- Effort: `M`
- Status: `Next`
- Goal: let creators find offers worth promoting
- Deliverables:
  - affiliate campaign discovery feed
  - search and filters
  - join/request flow
- Admin controls:
  - creator eligibility
  - visibility policy
- Dependencies:
  - P1-D1
- Acceptance:
  - creators can browse and join approved campaigns

### P1-D3: Affiliate reporting and payout attribution

- Priority: `P1`
- Effort: `L`
- Status: `Next`
- Goal: create trust in the affiliate system
- Deliverables:
  - attributed clicks
  - attributed conversions
  - affiliate earnings ledger
  - payout-ready summary
- Admin controls:
  - payout approval
  - fraud review queue
- Dependencies:
  - analytics, wallet, payout systems
- Acceptance:
  - affiliate revenue and attribution are auditable

## EPIC P1-E: Creator Subscriptions

### P1-E1: Paid memberships

- Priority: `P1`
- Effort: `L`
- Status: `Next`
- Goal: support recurring creator revenue
- Deliverables:
  - membership tiers
  - subscription checkout
  - subscriber state tracking
- Admin controls:
  - tier policy
  - creator eligibility
  - payout rules
- Dependencies:
  - payments, profiles, access gating
- Acceptance:
  - users can subscribe and access gated perks

### P1-E2: Subscriber-only content gates

- Priority: `P1`
- Effort: `M`
- Status: `Next`
- Goal: connect subscription to content value
- Deliverables:
  - subscriber-only posts
  - subscriber-only live or story access
  - premium community gating
- Admin controls:
  - gating policy
  - role-based restrictions
- Dependencies:
  - P1-E1, community, live
- Acceptance:
  - gated content visibility respects subscription state

## 6. P1 Backlog: Scroll and LIVE Revenue Surfaces

## EPIC P1-F: Scroll Conversion Layer

### P1-F1: Public threaded Scroll comments

- Priority: `P1`
- Effort: `M`
- Status: `Now`
- Goal: make Scroll socially deep, not shallow
- Deliverables:
  - public comment thread
  - reply support
  - visible commenter identity
  - moderation states
- Admin controls:
  - comment policy
  - moderation thresholds
- Dependencies:
  - current Scroll comment model
- Acceptance:
  - comments and replies work like post-card interactions

### P1-F2: Save to collection

- Priority: `P1`
- Effort: `M`
- Status: `Next`
- Goal: increase retention and purchase intent capture
- Deliverables:
  - save action
  - named collections
  - collection management UI
- Admin controls:
  - collection visibility defaults
- Dependencies:
  - favorites or saved-content model
- Acceptance:
  - users can save Scrolls into personal collections

### P1-F3: Scroll product and service tags

- Priority: `P1`
- Effort: `L`
- Status: `Now`
- Goal: make Scroll shoppable and bookable
- Deliverables:
  - tagged service or product card
  - direct CTA to storefront, DM, or brief
- Admin controls:
  - tag policy and category rules
- Dependencies:
  - storefront/tagging systems
- Acceptance:
  - tagged Scrolls convert to follow-on actions

## EPIC P1-G: Live Commerce

### P1-G1: Pinned live offers

- Priority: `P1`
- Effort: `M`
- Status: `Next`
- Goal: keep the host's primary monetization offer visible without disrupting viewing
- Deliverables:
  - pinned offer slot
  - expandable live offer popup
  - one-tap action to buy, book, or message
- Admin controls:
  - offer visibility rules
  - live offer limits
- Dependencies:
  - live viewer and storefront systems
- Acceptance:
  - pinned offer does not overlap critical video content

### P1-G2: Co-host and guest request system

- Priority: `P1`
- Effort: `L`
- Status: `Next`
- Goal: make live more interactive and sticky
- Deliverables:
  - guest request queue
  - host approval flow
  - co-host layout
- Admin controls:
  - guest eligibility
  - max participants
  - moderation rules
- Dependencies:
  - live session model, media stack
- Acceptance:
  - hosts can add or remove guests cleanly

### P1-G3: Post-live replay and clip conversion

- Priority: `P1`
- Effort: `L`
- Status: `Later`
- Goal: extend live monetization after the broadcast ends
- Deliverables:
  - replay page
  - clip extraction
  - clip sharing
  - post-live CTA cards
- Admin controls:
  - replay retention
  - clip permission policy
- Dependencies:
  - recording and storage model
- Acceptance:
  - live sessions can create replay content and continue conversion

## 7. P2 Backlog: Professional Publishing and Expertise Graph

## EPIC P2-A: Newsletter and Knowledge Layer

### P2-A1: Newsletter creation and publishing

- Priority: `P2`
- Effort: `L`
- Status: `Next`
- Goal: create recurring professional publishing on Scrolith
- Deliverables:
  - newsletter setup
  - issue publishing
  - subscriber management
- Admin controls:
  - newsletter enablement by role
  - category moderation
- Dependencies:
  - topics, publishing, notifications
- Acceptance:
  - eligible users can publish newsletters and gain subscribers

### P2-A2: Newsletter analytics

- Priority: `P2`
- Effort: `M`
- Status: `Next`
- Goal: make expertise publishing measurable
- Deliverables:
  - subscriber trend
  - open and engagement metrics
  - demographic and location analytics where available
- Admin controls:
  - analytics visibility rules
- Dependencies:
  - newsletter model
- Acceptance:
  - authors can view meaningful newsletter analytics

## EPIC P2-B: Expert Credibility Layer

### P2-B1: Topic authority score

- Priority: `P2`
- Effort: `L`
- Status: `Later`
- Goal: rank expertise based on proof and quality, not vanity alone
- Deliverables:
  - authority signals
  - topic-to-user scoring
  - public expertise markers
- Admin controls:
  - score weighting
  - topic governance
- Dependencies:
  - proofs, topics, publishing analytics
- Acceptance:
  - expertise labels reflect meaningful platform behavior

### P2-B2: Office hours and AMA sessions

- Priority: `P2`
- Effort: `M`
- Status: `Later`
- Goal: let experts host structured public or paid sessions
- Deliverables:
  - office-hour scheduling
  - registration or premium access
  - follow-up Q and A archive
- Admin controls:
  - host eligibility
  - access rules
- Dependencies:
  - events, live, monetization
- Acceptance:
  - experts can host scheduled sessions with clear access policy

## 8. P2 Backlog: Enterprise Hiring and Team Workflows

## EPIC P2-C: Team Workspaces

### P2-C1: Company workspace model

- Priority: `P2`
- Effort: `XL`
- Status: `Next`
- Goal: support employer teams instead of one-account buyers only
- Deliverables:
  - workspace entity
  - team seats
  - invite flow
  - role-specific permissions
- Admin controls:
  - workspace plan policy
  - seat limits
  - role templates
- Dependencies:
  - employer system, auth, role management
- Acceptance:
  - employers can operate inside a shared workspace

### P2-C2: Approval chains and saved talent pools

- Priority: `P2`
- Effort: `L`
- Status: `Later`
- Goal: support structured enterprise hiring
- Deliverables:
  - approval workflow for jobs and offers
  - saved talent pools
  - candidate shortlist workflow
- Admin controls:
  - approval templates
  - retention rules
- Dependencies:
  - workspaces, jobs, talent discovery
- Acceptance:
  - teams can collaborate on hiring decisions

## EPIC P2-D: Compliance and Onboarding

### P2-D1: Worker classification and onboarding tasks

- Priority: `P2`
- Effort: `L`
- Status: `Later`
- Goal: support larger buyers and lower operational risk
- Deliverables:
  - classification checklist
  - onboarding task workflow
  - compliance status tracking
- Admin controls:
  - compliance templates
  - required docs by region
- Dependencies:
  - workspaces, contracts, files
- Acceptance:
  - enterprise buyers can track compliance readiness

## 9. P2 Backlog: AI Copilot and Ranking Intelligence

## EPIC P2-E: User-side AI Copilot

### P2-E1: Brief generator

- Priority: `P2`
- Effort: `M`
- Status: `Next`
- Goal: reduce friction in starting work conversations
- Deliverables:
  - prompt-to-brief generation
  - editable brief drafts
  - recommended categories and milestones
- Admin controls:
  - AI enablement
  - prompt guardrails
- Dependencies:
  - AI, briefs, marketplace taxonomy
- Acceptance:
  - users can generate usable brief drafts from natural language

### P2-E2: Listing optimizer

- Priority: `P2`
- Effort: `M`
- Status: `Next`
- Goal: improve gig, job, and storefront quality
- Deliverables:
  - title suggestions
  - description improvements
  - tag suggestions
  - coverage and quality scoring
- Admin controls:
  - AI quality thresholds
  - content safety rules
- Dependencies:
  - AI, gigs, jobs, storefronts
- Acceptance:
  - users can improve listing quality with one guided workflow

### P2-E3: Cross-format content repurposing

- Priority: `P2`
- Effort: `L`
- Status: `Later`
- Goal: turn one idea into multiple surfaces
- Deliverables:
  - post -> Scroll draft
  - post -> story draft
  - post -> live promo draft
- Admin controls:
  - output policy
  - AI moderation rules
- Dependencies:
  - AI, posts, Scroll, stories, live
- Acceptance:
  - users can convert one content item into other formats quickly

## EPIC P2-F: Ranking and Recommendation

### P2-F1: Multi-mode feed ranking

- Priority: `P2`
- Effort: `XL`
- Status: `Next`
- Goal: let users switch the feed based on intent
- Deliverables:
  - Hire mode
  - Sell mode
  - Learn mode
  - Local mode
  - Live mode
  - Following mode
- Admin controls:
  - weighting per mode
  - cold-start policy
  - trust weighting
- Dependencies:
  - feed intent signals, topics, recommendations
- Acceptance:
  - each feed mode changes ranking behavior materially

### P2-F2: Why am I seeing this? layer

- Priority: `P2`
- Effort: `M`
- Status: `Later`
- Goal: improve transparency and control
- Deliverables:
  - explanation labels
  - hide or reduce similar content
  - feedback capture
- Admin controls:
  - explanation templates
  - feedback mapping rules
- Dependencies:
  - ranking model
- Acceptance:
  - users can understand and influence feed relevance

## 10. P3 Backlog: Governance and Experimentation

## EPIC P3-A: Feature Flag and Experiment Engine

### P3-A1: Feature rollout targeting

- Priority: `P3`
- Effort: `L`
- Status: `Later`
- Goal: ship safely by audience segment
- Deliverables:
  - role-based rollout
  - region-based rollout
  - cohort-based rollout
- Admin controls:
  - targeting rules
  - rollout percentage
- Dependencies:
  - config and admin systems
- Acceptance:
  - features can be enabled selectively without redeploying code

### P3-A2: Experiment manager

- Priority: `P3`
- Effort: `L`
- Status: `Later`
- Goal: optimize feed, live, commerce, and homepage performance
- Deliverables:
  - experiment definitions
  - control vs treatment assignment
  - metric comparison view
- Admin controls:
  - experiment lifecycle
  - metric binding
- Dependencies:
  - analytics, feature flags
- Acceptance:
  - operators can run measurable experiments on major surfaces

## EPIC P3-B: Policy Engine

### P3-B1: Policy templates

- Priority: `P3`
- Effort: `M`
- Status: `Later`
- Goal: make moderation and monetization policy operational
- Deliverables:
  - live policy templates
  - commerce policy templates
  - content policy templates
- Admin controls:
  - policy activation
  - role/region scoping
- Dependencies:
  - admin config infrastructure
- Acceptance:
  - policy changes can be applied without engineering release work

## 11. Suggested Delivery Order

### Wave 1

- P0-A1 Role-based verification badges
- P0-A2 Delivery and reliability score
- P0-B1 Live observability and diagnostics
- P0-B2 Retry-safe reactions, comments, and writes
- P1-A1 Convert chat thread to brief
- P1-A2 Convert brief to proposal
- P1-B1 Storefront tab on profiles
- P1-F1 Public threaded Scroll comments

### Wave 2

- P0-A3 Verified portfolio proof system
- P1-A3 Convert proposal to contract
- P1-B2 Tag products and services in content
- P1-C1 Repost with commentary
- P1-D1 Seller campaign creation
- P1-F3 Scroll product and service tags
- P1-G1 Pinned live offers

### Wave 3

- P1-A4 Timeline inside messaging
- P1-B3 Pinned offers and featured collections
- P1-C2 Share cards with attribution tracking
- P1-D2 Creator affiliate discovery
- P1-E1 Paid memberships
- P1-G2 Co-host and guest request system
- P2-A1 Newsletter creation and publishing
- P2-E1 Brief generator
- P2-F1 Multi-mode feed ranking

### Wave 4

- P1-D3 Affiliate reporting and payout attribution
- P1-E2 Subscriber-only content gates
- P1-G3 Post-live replay and clip conversion
- P2-A2 Newsletter analytics
- P2-C1 Company workspace model
- P2-E2 Listing optimizer
- P3-A1 Feature rollout targeting
- P3-B1 Policy templates

### Wave 5

- P2-B1 Topic authority score
- P2-B2 Office hours and AMA sessions
- P2-C2 Approval chains and saved talent pools
- P2-D1 Worker classification and onboarding tasks
- P2-E3 Cross-format content repurposing
- P2-F2 Why am I seeing this? layer
- P3-A2 Experiment manager

## 12. Definition of Done

No backlog item should be considered complete unless it ships with:

- user-facing UI
- backend API and data model support
- admin controls
- analytics instrumentation
- error handling and fallback behavior
- QA coverage across desktop, mobile web, and mobile app where relevant

## 13. Final Backlog Principle

Scrolith should prioritize features that strengthen one of these loops:

- identity to opportunity
- audience to revenue
- message to money
- social proof to commerce
- admin to platform quality

If a feature does not strengthen one of those loops, it should be deprioritized.
