# G1 proposed route/method manifest

**PREPARATION ONLY — DOES NOT AUTHORIZE DAST.** Source snapshot: geezlesocial/scrolith, branch backend/main, commit c27caec1ef6ab71654fc3fc1d9bc6cd602c8ef2c. No route was contacted or executed.

## Inventory semantics and disposition

The route list below is a static literal declaration census from geezle-backend/src/routes/**, excluding tests. Each entry is the method and router-local path, grouped by exact source file. Construct its externally visible path by adding the applicable app.use(prefix, router) mount in src/server.ts and any nested router prefixes. Dynamic declarations, 41 multiline call sites, runtime-generated paths, direct app.* routes, and conditional registrations require manual expansion. This is a comprehensive declaration inventory, not a certified final externally reachable endpoint list. The container starts dist/server.js; the separate src/app.ts test/dev app is not the authoritative deployed entrypoint.

Census: 1,591 route call sites; 1,550 single-line literal declarations parsed; 41 unresolved call sites; 1,217 distinct literal method + router-local-path pairs across 141 route files. Same method/path can be registered by multiple routers and remains file-scoped below.

Every row is held from authorization. GET/HEAD/OPTIONS are MANUAL-REVIEW (read methods can still reveal private data or trigger side effects). POST/PUT/PATCH/DELETE/ALL are EXCLUDE until a handler-specific synthetic fixture, bounded effect, and verified cleanup are reviewed. No route is cleared for scanning. Authentication, application role, staff permission, tenant/ownership control, parameters, upload/download, payment/gift/webhook/email/notification/AI/admin effects, per-route rate limit, and destructive risk remain REQUIRES MANUAL REVIEW unless the registration itself exposes a control. This list is not an authorization grant.

Required review categories: A Public/Guest; B Authentication/session; C Member; D Freelancer; E Employer/company administrator; F Moderator; G Analyst; H Platform administrator; I Cross-role authorization/IDOR/BOLA; J Upload/media; K Marketplace/orders; L Payments; M Dashcoin Gifts; N Webhooks/integrations; O WebSocket/Socket.IO; P AI/Scrolitha; Q Security headers/CORS/CSRF/CSP; R Explicitly excluded/dangerous. Categories cannot be assigned reliably from route declaration alone. Module/prefix names below are review hints only; handler and middleware determine actual category.

For every mutating route, any later review must name a synthetic identity and isolated fixture, expected side effect, idempotency behavior, and proven cleanup/rollback. No such fixture/cleanup is established here. Therefore mutations remain EXCLUDE; do not infer safe cleanup from another endpoint.

## Primary mount map and global controls

At this source snapshot, src/server.ts mounts these router modules (nested prefixes still need expansion):

| Prefix | Router/module binding |
|---|---|
| /api/cms | cmsRoutes; cmsAuthPagesRoutes |
| /api/homepage | homepageRoutes |
| /api/i18n | i18nRoutes |
| /api/admin/fx | authMiddleware + adminMiddleware + fxAdminRoutes |
| /api/admin | adminRoutes and nested admin routers |
| /api/apps | appsRoutes |
| /api/auth | authRoutes |
| /api/security | loginApprovalRoutes |
| /api/dev | devRoutes |
| /api/oauth | oauthDevRoutes |
| /api/users; /api/profile; /api/location; /api/settings | respective routers |
| /api/marketing; /api/commerce; /api/feed; /api/topics; /api/pipeline | respective routers |
| /api/search; /api/search/v2 | searchRoutes; enterpriseSearchRoutes |
| /api/discovery; /api/instant-graph; /api/discovery-engine; /api/professional-discovery | respective routers |
| /api/ai | aiRoutes |
| /api/gigs; /api/jobs; /api/freelancer; /api/employer | respective routers |
| /api/freelancer/resumes; /api/client/resume-reviews; /api/resume; /api/categories | respective routers |
| /api/admin/gigs-jobs | adminGigsJobsRoutes |
| /api/wallet; /api/escrow; /api/withdrawal | respective financial routers |
| /api/community; /api/scroll; /api/live; /api/posts | respective routers |
| /api/marketplace; /api/contracts; /api/messages; /api/collaboration; /api/trust | respective routers |
| /api/moderation/chat; /api/moderation/accounts | respective routers |
| /api/reactions; /api/files; /api/favorites; /api/cart; /api/orders; /api/proposals; /api/plans | respective routers |
| /api/kyc; /api/support; /api/human-verification; /api/gcoin; /api/reviews; /api/payments | respective routers |
| /api/founding-partners | foundingPartnersRoutes |
| /api/admin/founding-partners | authMiddleware + adminMiddleware + adminFoundingPartnersRoutes |
| /api/currencies; /api/briefs; /api/notifications; /api/forms; /api/monetization; /api/payouts/stripe | respective routers |
| /api/public/preloader; /api/public/v1; /api/public/developer; /api/reco; /api/recommendations/hiring; /api/match; /api/intelligence/feedback | respective public/recommendation routers |
| /api/scrolitha; /api/phase3; /api/procurement; /api/ecosystem; /api/integrations; /api/insights | respective routers |
| /api/admin/preloaders | adminPreloadersRoutes |

src/server.ts applies Helmet, CORS, a global /api/ limiter, JSON/urlencoded parsers and API maintenance/KYC middleware before route registration; /uploads also has asset CORS and a limiter. Route-specific middleware varies. This is not a complete per-route authorization or rate-limit audit.

## Direct server routes outside the router census

src/server.ts directly declares OPTIONS *; POST /api/payments/stripe/webhook and /api/webhooks/stripe; GET /uploads/*; favicon GETs; GET /share/posts/:id; GET/HEAD /api/health; GET /api/health/details; GET/HEAD /api/readyz and /api/health/ready; GET /api/health/components; GET /api/observability/metrics-catalog; GET /metrics; diagnostic GETs /api/test-homepage, /api/socket-test, /ws-test, /socket-test; GET /api/public/system-status; GET/PUT /api/community/admin/config; and GET /api/_routes. Webhooks, diagnostics, detailed health, metrics, uploads and admin configuration are not cleared; review their guards/integration effects. Stripe webhook routes are EXCLUDE.

## WebSocket/Socket.IO inventory — separate protocol

src/server.ts creates default namespace / and namespace /community; src/realtime/socket.ts also creates a server/socket setup. Event families found include handshake, message, messages:debug_trace, messages:typing, messages:recording, messages:group:join, messages:group:leave, messages:catchup, presence:heartbeat, community:join, join:wallet, join:post, join:ad, collaboration:join, live:join, live:leave, live:signal, call:initiate, call:accept, call:reject, call:end, call:participant:add, call:participant:left, call:join, call:join-request, call:join-approve, call:join-reject, call:join-cancel, call:signal, call:media, join-room, leave-room, ping, and connection/disconnect/error/upgrade lifecycle events. This is an event-family inventory, not full payload/guard analysis. All events are MANUAL-REVIEW; messaging, calls, wallet, client-supplied room IDs, signaling/media and membership are excluded until auth, permission, payload schema, room ownership, synthetic data, and side effects are reviewed. No WebSocket traffic is authorized.

## Per-file route declarations

Warning: truncated output (original token count: 11667)
Total output lines: 1833
### `geezle-backend/src/routes/admin/analytics.routes.ts`
- `GET /activity` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /revenue-breakdown` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/approval.routes.ts`
- `GET /policies` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /requests` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /policies` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /requests/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /requests/:id/reject` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /requests/observe` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /policies/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/apps.routes.ts`
- `DELETE /campaigns/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /analytics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /campaigns` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /events` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /campaigns/:id/resend` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /campaigns/send` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /campaigns/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/audit.routes.ts`
- `GET /events` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/carts.routes.ts`
- `DELETE /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /items/:itemId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/community/ads.ts`
- `DELETE /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /analytics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /list` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /review-queue` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/pause` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/reject` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/resume` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /create` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/community/gcoin.ts`
- `GET /conversions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /fraud` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /transactions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /wallets` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /adjust/:userId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversions/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /credit` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/compliance.routes.ts`
- `GET /appeals` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /cases` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /report` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /risk-rules` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /appeals/:id/resolve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /cases` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /cases/:id/decisions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /cases/:id/evidence` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /holds` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /holds/:id/release` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /risk-rules` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /risk-snapshots` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /risk-rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/config.routes.ts`
- `GET /changes` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /current` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /releases` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /rollbacks` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /scopes` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /snapshots` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /releases` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /rollback` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /snapshots` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/dev.routes.ts`
- `DELETE /docs/pages/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /apps` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /developers` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /docs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /apps/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /apps/:id/disable` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /apps/:id/reject` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /developers/:id/suspend` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /developers/:id/unsuspend` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /docs/pages` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /docs` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /docs/pages/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/discovery.routes.ts`
- `DELETE /search-rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /feed-recipes` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /search-rules` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /feed-recipes` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /search-rules` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /feed-recipes/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /search-rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/favorites.routes.ts`
- `DELETE /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /top` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/feature-control.routes.ts`
- `DELETE /rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /audit` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /exposures` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /flags` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /flags/:id/audiences` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /flags/:id/rules` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /flags` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /flags/:id/audiences` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /flags/:id/kill-switch` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /flags/:id/rules` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /resolve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /audiences/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /flags/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/forms.routes.ts`
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/foundingPartners.routes.ts`
- `GET /partners` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /profit-periods` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /program` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /distribution-runs/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /distribution-runs/:id/execute` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /partners/:id/deactivate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /partners/:id/reactivate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /profit-periods` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /profit-periods/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /profit-periods/:id/close` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /profit-periods/:id/distribution-run` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /program/status` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/fraud.routes.ts`
- `GET /alerts` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /logs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/fx.routes.ts`
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /locks` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /overrides` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /providers` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /snapshots` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /overrides` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /overrides/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /snapshots/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /snapshots/:id/freeze` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sync` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /providers/:code` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/gigs-jobs.routes.ts`
- `DELETE /categories/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /gigs/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /jobs/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /categories` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /categories/gigs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /categories/jobs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /dashboard/stats` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /gigs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /jobs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /plans` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /test` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /plans/:id/toggle` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /categories` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /categories/sync-standard` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /gigs` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /gigs/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /jobs` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /jobs/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /plans` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /gigs/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /jobs/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/hiring-recommendations.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /analytics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:state` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /reset` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/i18n.routes.ts`
- `DELETE /keys/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /overrides/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /export` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /keys` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /overrides` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /values` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /import` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /keys` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /overrides` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /keys/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /overrides/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /values` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/i18n.translation.routes.ts`
- `DELETE /glossary/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /audit` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /glossary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /glossary` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /test` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /glossary/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/index.ts`
- `GET /ai/analytics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /homepage/draft` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /homepage/mobile-settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /platform/ads` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /platform/ads/refund-policy` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /platform/settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /system/settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /test` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /wallets` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /homepage/publish` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /homepage/reorder` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /platform/ads` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /platform/ads/refund-policy` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /platform/settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /settings/update` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /system/cache/clear` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /system/email/test` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /system/settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /homepage/mobile-settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /homepage/section` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /profile` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/insights.routes.ts`
- `GET /achievements` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /challenges` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /leaderboard/:weekKey` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /quests` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /achievements` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /achievements/:id/toggle` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /challenges` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /challenges/:id/finalize` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /challenges/:id/toggle` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /leaderboard/rebuild` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /quests` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /quests/:id/toggle` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /recompute/:userId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /recompute-all` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /achievements/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /challenges/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /quests/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/journeys.routes.ts`
- `DELETE /flows/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /templates/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /flows` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /quiet-hours` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /runs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /templates` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /flows` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /runs` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /templates` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /flows/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /templates/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/kyc.routes.ts`
- `POST /submit` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/live.routes.ts`
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /reports` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /restrictions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /sessions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /reports/:id/resolve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/end` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /users/:id/ban` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /users/:id/restore` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /users/:id/restrict` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/marketing.routes.ts`
- `DELETE /campaigns/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /affiliates` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /affiliates/applications` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /affiliates/settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /campaigns` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /popup-subscribe` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /affiliates/:id/status` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /affiliates/applications/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /affiliates/applications/:id/reject` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /campaigns` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /campaigns/:id/send` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /popup-subscribe` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /affiliates/settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/market-intelligence.routes.ts`
- `GET /demand-forecast` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /kpis` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ltv-predictions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /opportunity-radar/summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/marketplace.routes.ts`
- `DELETE /categories/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /listings/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /categories` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /listings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /listings/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /reports` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /categories` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /categories/:id/restore` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /categories/bulk-disable` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /categories/bulk-restore` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/feature` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/reject` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/report` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/restore` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/suspend` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/unfeature` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/bulk-delete` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /reports/:id/resolve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /categories/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /listings/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/media-recovery.routes.ts`
- `POST /audit` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /repair` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /run` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/messaging-groups.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/messenger.voice.routes.ts`
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/moderation-policies.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /appeals` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /cases` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /appeals/:id/resolve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/monetization.routes.ts`
- `GET /applications` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /applications/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /applications/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /applications/:id/reject` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /users/:userId/disable` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/notification-ops.routes.ts`
- `GET /ops/audit` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/campaigns` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/campaigns/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/campaigns/:id/preview` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/delivery` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/devices` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/engagement-automations/rules` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/engagement-automations/state` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/engagement-automations/stats` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/failures` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/feature-flags` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/live` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/overview` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/queue` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/retention` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/retries` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/templates` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/templates/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/templates/history/:key` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /ops/campaigns/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /ops/engagement-automations/rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /ops/templates/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/campaigns` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/campaigns/:id/cancel` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/campaigns/:id/confirm` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/campaigns/:id/send` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/engagement-automations/preview` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/engagement-automations/rules` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/engagement-automations/test` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/retries/:id/cancel` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/retries/:id/retry` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/retries/batch` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/retries/enqueue` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/templates` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/templates/:id/preview` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/templates/:id/publish` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/templates/:id/rollback` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /ops/engagement-automations/state` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /ops/feature-flags` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /ops/retention` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /ops/settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/observability.routes.ts`
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/payouts.stripe.routes.ts`
- `GET /accounts` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /config/invalidate-cache` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /users/:userId/disable` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /users/:userId/enable` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/policies.routes.ts`
- `DELETE /overrides/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /catalog` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /overrides` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /rules` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /overrides` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /rules` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /overrides/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/preloaders.routes.ts`
- `DELETE /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/activate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/deactivate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/procurement.routes.ts`
- `GET /approvals/queue` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /budget-rules` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /cost-centers` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /invoice-packages/consolidated` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /invoices` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /invoices/:id/package` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /purchase-requests` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /budget-rules` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /cost-centers` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /invoices` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /invoices/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /invoices/:id/credit-notes` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /invoices/:id/reconcile` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /purchase-requests/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /purchase-requests/:id/hold` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /purchase-requests/:id/reject` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /budget-rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /cost-centers/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/rbac.routes.ts`
- `DELETE /roles/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /permissions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /roles` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /roles` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /roles/:id/clone` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /roles/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/realtime.routes.ts`
- `GET /deliveries` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /incidents` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /presence` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /replays` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /runtime` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /socket-sessions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /deliveries/:id/replay` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /incidents` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /incidents/:id/resolve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/reco.routes.ts`
- `DELETE /rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /analytics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /audit` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /rules` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /rules` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/reviews.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /:id/status` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/scrolitha.routes.ts`
- `DELETE /post-ai/insights` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /skills/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /analytics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /audit` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /chat-records` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /learning-insights` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /logs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /models` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /skills` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /tools` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /chat` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /execute` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /knowledge/reindex` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /policies/update` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /post-ai/regenerate-insights` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /skills` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /skills/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/scrolitha-ai.routes.ts`
- `GET /audit` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /discovery/analytics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /feature-flags` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /models` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /overview` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /prompts` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /providers` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /usage` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /prompts` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /prompts/:promptId/publish` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /prompts/:promptId/rollback` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /providers/:provider/test` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /feature-flags` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /feature-flags/:flag` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /models/:modelId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /prompts/:promptId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /providers/:provider` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/scrolitha-managed.routes.ts`
- `GET /ai-outputs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /escalation-rules` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /projects` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ai-outputs` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ai-outputs/:id/review` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /assignments` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /escalation-rules` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /milestones` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /projects` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /escalation-rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /milestones/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /projects/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/scrolith-match.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /analytics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/scroll.routes.ts`
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /reports` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /videos` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/message` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/remove` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/warning` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /reports/:id/review` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /users/:userId/restrictions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /users/:userId/restrictions/:restrictionId/lift` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/security-alerts.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/acknowledge` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/dismiss` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/resolve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/staff.routes.ts`
- `DELETE /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /roles` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/reset-password` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/system-backups.routes.ts`
- `DELETE /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:id/download` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /jobs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /meta` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/restore` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/verify` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /create` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /delete-batch` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /import` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/system-demo-accounts.routes.ts`
- `GET /overview` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /accounts/:id/toggle` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /run-once` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /seed` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /config` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/talent-cloud.routes.ts`
- `GET /access-rules` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /api-keys` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /connectors` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /integrations` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /pools` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /vendor-requirements` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /webhook-deliveries` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /access-rules` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /api-keys` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /connectors` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /integrations` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /pool-members` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /pools` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /seed-examples` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /vendor-requirements` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /webhook-deliveries/:id/retry` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /access-rules/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /api-keys/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /connectors/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /integrations/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /pools/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /vendor-requirements/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/trust.routes.ts`
- `GET /signals` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /users` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /users/:userId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /signals` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /users/:userId/recompute` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /signals/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/users.routes.ts`
- `DELETE /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /:id/call-capabilities` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/password` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/status` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/admin/withdrawals.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /methods` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /payout-accounts` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /payout-accounts/:userId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/mark-paid` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/reject` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /methods` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/ai.ts`
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /answer` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /guide` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /post-enhance` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /post-insight` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /scrolitha-answer` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /scrolitha-guide` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /support-chat` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/apps.routes.ts`
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /track` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/auth.routes.ts`
- `DELETE /passkeys/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /2fa/status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /follow-onboarding` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /languages/catalog` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me/language-preferences` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /oauth/:provider` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /oauth/:provider/callback` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /passkeys` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /me/language-preferences` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /passkeys/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /2fa/disable` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /2fa/enroll/begin` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /2fa/enroll/confirm` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /2fa/enroll/setup/begin` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /2fa/enroll/setup/confirm` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /2fa/verify` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /follow-onboarding/complete` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /forgot-password` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /login` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /login/approval/exchange` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /logout` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /passkeys/authentication/options` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /passkeys/authentication/verify` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /passkeys/registration/options` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /passkeys/registration/verify` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /register` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /reset-password` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /me/language-preferences` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/auth.ts`
- `GET /profile` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /login` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /register` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/briefs.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/use-to-create-job` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /from-conversation/draft` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /generate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/cart.routes.ts`
- `DELETE /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /items` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /items/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /items/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /items` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/categories.routes.ts`
- `GET /gigs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /jobs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/cms.auth-pages.routes.ts`
- `GET /auth-pages` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /auth-pages` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/cms.ts`
- `GET /activity` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /affiliate/content` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /answers` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /auth-pages` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /blog/categories` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /blog/posts` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /blog/posts/:slug` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /blog/settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /categories` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /footer` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /freelancer` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /guides` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /header` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /hero-search` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /hire` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /homepage` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /homepage/sections` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /pages` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /pages/:slug` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /platform-settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /slides` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /trending-config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /header` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/collaboration.routes.ts`
- `GET /rooms` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /rooms/:roomId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /rooms` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /rooms/:roomId/activity` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /rooms/:roomId/presence` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/commerce.routes.ts`
- `GET /categories` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /gigs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /gigs/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/commerce.ts`
- `GET /categories` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /gigs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /gigs/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /gigs/:id/purchase` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/community.ts`
- `DELETE /admin/business-pages/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /ads/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /blocks/:userId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /business-pages/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /comments/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /follow/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /posts/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /posts/:id/like` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /pos…1667 tokens truncated…ooks` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /developer/widgets` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /phase4/briefing` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /public/apis` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /developer/webhooks` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /developer/webhooks/:id/test` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /developer/widgets` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/employer.routes.ts`
- `GET /contracts` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /jobs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /overview` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /proposals` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/enterpriseSearch.routes.ts`
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /metrics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /query` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /rollout` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /suggest` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /feedback` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /query` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/escrow.routes.ts`
- `POST /:id/refund` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/release` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/favorites.routes.ts`
- `DELETE /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /expanded` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /received` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/feed.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /intent` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/files.routes.ts`
- `DELETE /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:fileId/manifest` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:fileId/processing-status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:fileId/variants/:variantId/content` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /content/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /upload` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/forms.routes.ts`
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/foundingPartners.routes.ts`
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /program` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /enrollment/checkout` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/freelancer.routes.ts`
- `GET /contracts` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /gigs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /overview` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /proposals` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/gcoin.routes.ts`
- `GET /admin/fraud` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /admin/summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /admin/transactions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /earnings/by-post` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /earnings/summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /transactions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /wallets` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /wallets/:userId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /admin/adjust` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /admin/credit` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /admin/recompute` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversions/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /convert/request` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /donate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /donate/scroll` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /rewards` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /transactions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /transfer` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /wallets/:userId/freeze` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /wallets/:userId/unfreeze` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/gigs.ts`
- `DELETE /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/activate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/pause` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/submit` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/hiringRecommendations.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /click` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /dismiss` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /impression` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /snooze` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/homepage.routes.ts`
- `GET /guest` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /mobile-settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/humanVerification.routes.ts`
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /create` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /verify` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/i18n.ts`
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /dictionary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /overrides` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/insights.routes.ts`
- `GET /achievements/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /challenges/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /engagement-phase/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /feed-mode` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /leaderboard` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /matches/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /opportunity-hub/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /pgs/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /post/:postId/prediction` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /quests/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /revenue/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /skill-gap/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /streak/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /challenges/:challengeId/entries` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /challenges/:challengeId/vote` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /engagement-phase/bounties/questions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /engagement-phase/bounties/questions/:questionId/answers` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /engagement-phase/bounties/questions/:questionId/award` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /engagement-phase/fan-channels/:channelId/subscribe` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /engagement-phase/mini-games/:gameId/submit` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /engagement-phase/premium-series/:seriesId/unlock` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /engagement-phase/seasons/:seasonId/passes/:passId/activate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /feed-mode` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /opportunity-brief` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /quests/:userQuestId/complete` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /skill-gap/generate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /streak/friends/:friendStreakId/end` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /streak/friends/:friendStreakId/respond` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /streak/friends/invite` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /streak/referral-squads/:squadId/leave` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /streak/referral-squads/invite` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /streak/referral-squads/invites/:inviteId/respond` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /streak/reward-drops/:dropId/claim` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/instantGraph.routes.ts`
- `GET /admin/metrics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /bootstrap` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /metrics` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/integrations.routes.ts`
- `GET /enterprise/talent-cloud/snapshot` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /inbound/:id/status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /inbound/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/intelligenceFeedback.routes.ts`
- `GET /metrics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /events` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/jobs.routes.ts`
- `DELETE /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/activate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/close` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/pause` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/submit` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/kyc.routes.ts`
- `GET /document-types` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /form-config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /documents` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /submit` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/live.routes.ts`
- `DELETE /sessions/:id/recording` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /feature-status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /runtime-config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /sessions/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /sessions/:id/comments` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /sessions/:id/recording` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /sessions/active` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /invites/:inviteId/accept` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/comments` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/end` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/filter` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/gifts` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/invite` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/leave` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/reactions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/recording/publish` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/recording/unpublish` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/report` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sessions/:id/start` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /sessions/:id/recording` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/location.routes.ts`
- `GET /reverse` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /search` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /resolve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/loginApproval.routes.ts`
- `DELETE /devices/:deviceId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /login-approvals/pending` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /overview` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /login-approvals/:id/approve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /login-approvals/:id/reject` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /login-approvals/:id/status` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /login-approvals/trusted-device` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/marketing.routes.ts`
- `GET /affiliate/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /affiliate/settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /popup-banners` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /popup-subscribe` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /affiliate/apply` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /affiliate/link` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /affiliate/withdraw` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /subscribe` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/marketplace.routes.ts`
- `DELETE /listings/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /listings/:id/favorite` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /listings/:id/media/:mediaId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /categories` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /dashboard` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /listings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /listings/:idOrSlug` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/checkout-quote` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/contact` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/favorite` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/mark-sold` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/media` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/orders` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/report` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/reserve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/share-to-group` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /listings/:id/submit` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /listings/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/messages.routes.ts`
- `DELETE /conversations/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /conversations/:id/appearance` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /conversations/:id/members/:memberUserId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /conversations/:id/messages/:messageId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /conversations/:id/pins/:messageId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /groups/:id/pins/:messageId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations/:id/appearance` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations/:id/attachments` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations/:id/call-policy` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations/:id/member-candidates` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations/:id/members` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations/:id/messages/around/:messageId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations/:id/pins` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations/:id/security` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations/:id/voice-calls` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /groups/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /groups/:id/audit` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /groups/:id/catchup` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /groups/:id/health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /groups/:id/join-requests` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /groups/:id/permissions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /groups/:id/pins` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /groups/discover` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /groups/metrics/realtime` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /groups/search` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /presence` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /scrolitha/ensure` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /search` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings/privacy` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /voice/config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /voice/ice-servers` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /conversations/:id/call-policy` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /conversations/:id/group` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /conversations/:id/members/:memberUserId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /conversations/:id/messages/:messageId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /conversations/:id/preferences` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /groups/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /groups/:id/permissions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /presence/privacy` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /settings/privacy` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/invites` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/members` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/members/resolve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/messages` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/messages/:messageId/copy` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/messages/:messageId/reactions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/pins` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/read` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/receipts` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/report-block` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/unread` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/voice-notes` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /groups` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /groups/:id/invites` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /groups/:id/join` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /groups/:id/join-requests` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /groups/:id/join-requests/:requestId/:decision` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /groups/:id/lock` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /groups/:id/pins` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /groups/:id/restrictions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /groups/:id/unlock` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /groups/search/saved` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /invites/:code/accept` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /presence/heartbeat` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /scrolitha/ensure` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /scrolitha/turn` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /scrolitha/turn/stream` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /conversations/:id/appearance` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/moderation.accounts.routes.ts`
- `GET /users/:userId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /users/:userId/action` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/moderation.chat.routes.ts`
- `GET /audit` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /conversations/:id/messages` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /records` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /records/export` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /records/retention` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversations/:id/message` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /records/retention` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/monetization.routes.ts`
- `GET /applications` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /apply` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/notifications.routes.ts`
- `DELETE /devices/:deviceId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /focus-mode` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /quiet-hours/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /counters` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /devices` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /digests` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /digests/:digestId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /digest-settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /focus-mode` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /preferences` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /quiet-hours` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /sync-state` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /user/:userId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /preferences` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /preferences/categories/:category` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /preferences/events/:eventType` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /actions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /bulk` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /create` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /device/register` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /device/unregister` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /digests/:digestId/mark-read` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /emit` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /focus-mode` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /mark-all-read` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /mark-read` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /mark-unread` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /preferences/evaluate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /preferences/reset` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /quiet-hours` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /receipts` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sync/heartbeat` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /sync-state` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /test/push` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /digest-settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /quiet-hours` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/oauth.dev.routes.ts`
- `GET /userinfo` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /authorize` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /revoke` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /token` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/orders.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/deliver` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/propose-revision` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/request-info` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/payment.routes.ts`
- `GET /dragonpay/callback` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /methods/active` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /antom/notify` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /create-intent` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /flutterwave/webhook` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /monnify/webhook` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /opay/webhook` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /paymongo/webhook` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /payoneer/notify` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /paypal/webhook` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /paystack/webhook` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /reconcile-adpayments` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /webhook` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /xendit/webhook` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/payouts.stripe.routes.ts`
- `GET /auto-settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /create-account` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /disconnect` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /login-link` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /onboarding-link` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /auto-settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/phase3.routes.ts`
- `GET /briefing` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /creator-commerce/campaigns` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /localization/global` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /payouts/orchestration` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /workspaces` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /workspaces` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/pipeline.routes.ts`
- `DELETE /:entityType/:entityId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /save` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/plans.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /purchase` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/posts.routes.ts`
- `GET /:id/options-state` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:id/why-this-post` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /collections` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/follow-author` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/hide` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/interested` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/not-interested` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/report` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/save` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/toggle-notifications` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/unfollow-author` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/unsave` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /collections` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/preloader.routes.ts`
- `GET /active` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/procurement.routes.ts`
- `GET /invoices/mine` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /purchase-requests/mine` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /purchase-requests` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/professionalDiscovery.routes.ts`
- `GET /blogs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /career` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /groups` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /growth-pulse` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /home` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /marketplace` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/profile.routes.ts`
- `DELETE /me/availability` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /me/hiring-status` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me/availability` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me/hiring-status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /me/availability/pause` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /me/availability/resume` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /me/hiring-status/pause` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /me/hiring-status/resume` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /me` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /me/availability` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /me/hiring-status` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/proposals.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /my` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/accept` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/interview` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/message` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/reject` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/shortlist` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/unshortlist` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/withdraw` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/public.developer.routes.ts`
- `GET /config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/public.v1.routes.ts`
- `GET /catalog` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /gigs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /jobs` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /pages` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /posts` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /search` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/reactions.routes.ts`
- `GET /summary` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /users` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /summary/bulk` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/reco.routes.ts`
- `GET /accounts` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /feedback` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/reviews.routes.ts`
- `GET /admin/all` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me/pending` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /users/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /admin/:id/status` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/scrolitha.routes.ts`
- `GET /contextual/status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /contextual/suggestions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /history` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /intelligence/analytics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /intelligence/diagnostics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /intelligence/health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /intelligence/network-status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /intelligence/rollout` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /intelligence/session` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /intelligence/skills` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /knowledge` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /learning/snapshot` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /memory` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /message-security` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/calibration` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/evaluation` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /ops/metrics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /platform-identity` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /privacy` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /public-info` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /public-profile` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /records` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /widget-config` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /chat` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /comment-suggestions` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /contextual/ask` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /contextual/retry` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /execute` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /feedback` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /gig-improve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /hashtags` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /intelligence/ask` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /intelligence/dismiss` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /intelligence/search` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /job-improve` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /learning/signal` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /memory/clear` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /moderation/assist` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /ops/calibration/signal` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /os/ask` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /os/bootstrap` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /os/cancel` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /profile/analyze` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /profile/apply` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /proposal-draft` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /recommendations/personalized-rank` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /rewrite` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /stream` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /toxicity-check` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /trust/assess` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /work-os/plan` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /privacy` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/scrolithaAi.routes.ts`
- `DELETE /assistant/conversations` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /assistant/conversations/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /discovery/memory` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /history` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /assistant/conversations` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /assistant/conversations/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /assistant/export` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /assistant/prompts` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /assistant/status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /beta-allowlist` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /copilot/status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /discovery/dashboard` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /discovery/memory` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /discovery/memory/export` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /discovery/recommendations` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /discovery/status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /history` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /preferences` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /skills` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /usage` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /assistant/conversations/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /discovery/memory` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /preferences` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /assistant/chat` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /assistant/composer` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /assistant/conversations` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /assistant/draft` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /assistant/feedback` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /assistant/notifications` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /assistant/prompts/:id/use` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /assistant/rewrite` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /assistant/search-suggest` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /assistant/translate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /copilot` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /discovery/feedback` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /discovery/feed-scores` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /discovery/notifications` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /discovery/search-assist` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /discovery/signals` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /intent` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /orchestrate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /preferences/reset` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /rewrite` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /skills/run` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /summarize` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /beta-allowlist` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/scrolithMatch.routes.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /mutual` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /preferences` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /conversation` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /dismiss` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /interest` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /preferences` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/scroll.routes.ts`
- `DELETE /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /comments/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `DELETE /series/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:id/comments` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /feed` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /mine` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /search` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /series/:id` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /series/discover` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /series/mine` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/comments` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/engage` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/interested` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/not-interested` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:id/report` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /create` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /series` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /comments/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /series/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/search.ts`
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /analytics` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /history` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /quick-tags` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /recommendations` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /recommendations/:userId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /semantic` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /suggestions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /trending` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /unified` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /history` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/settings.routes.ts`
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /me` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/support.routes.ts`
- `DELETE /categories/:id` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /categories` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /tickets` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /tickets/:idOrCode` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /tickets/mine` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /tickets/:id/priority` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PATCH /tickets/:id/status` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /categories` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /tickets` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /tickets/:id/replies` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /tickets/auth` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/topics.routes.ts`
- `DELETE /:topicId/follow` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /follows/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:topicId/follow` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/trust.routes.ts`
- `GET /graph/:userId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /graph/me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/user.ts`
- `GET /:userId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/availability` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/followers` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/following` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/hiring-status` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/profile` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/settings` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/storefront` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/trust-score` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/viewers` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/viewing` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /health` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /username/:username` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /username/availability/:username` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:userId/follow` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:userId/password` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:userId/unfollow` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:userId/views` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:userId` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:userId/profile` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `PUT /:userId/settings` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/wallet.routes.ts`
- `GET /:userId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/escrows` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /:userId/transactions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /admin/gateways` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /admin/transactions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /gateways` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me/escrows` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me/transactions` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /platform-financials` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /settings/commission` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /topup/providers` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /topup/status/:intentId` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:userId/adjust` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:userId/freeze` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /:userId/unfreeze` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /admin/gateways` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /settings/commission` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /topup/initiate` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /transactions/:id/reverse` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
### `geezle-backend/src/routes/withdrawal.routes.ts`
- `GET /account` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /me` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `GET /methods` — **MANUAL-REVIEW**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /account` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
- `POST /request` — **EXCLUDE (fixture + cleanup unverified)**; auth/effects/rate limit **REQUIRES MANUAL REVIEW**.
