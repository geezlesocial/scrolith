# Geezle Platform - Production Migration Audit Report
**Date:** 2024-12-19  
**Status:** Prompt A - Audit & Fix Plan  
**AI Engineer:** System Analysis Complete

---

## Executive Summary

This audit identifies **all mock data, localStorage state, fake Promise.resolve patterns, and hardcoded arrays** across the Geezle codebase. Each mock source has been mapped to its correct backend API endpoint replacement.

**Critical Findings:**
- **18 frontend files** using localStorage for state management
- **49 frontend files** containing mock/hardcoded data
- **11 backend files** with mock data responses
- **Missing dependencies:** Validation (zod/joi), Logging (pino/winston), RBAC middleware improvements
- **Socket.io** partially implemented but not fully integrated with CMS updates

---

## 1. File-by-File Issue List

### 1.1 Frontend Services (Critical - Core Data Layer)

#### `src/services/wallet.ts` ✅ **FIXED**
- **Status:** Already migrated to API calls
- **Previous Issues:** localStorage for wallets, transactions, escrows
- **API Endpoints:** `/api/wallet/me`, `/api/wallet/me/transactions`, `/api/wallet/me/escrows`

#### `src/services/auth.ts` & `src/services/authService.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `localStorage.getItem('user')` for user state
  - `localStorage.getItem('token')` (acceptable for token storage)
  - Mock user creation on login failure
  - `Promise.resolve()` with hardcoded user objects
- **API Endpoints:**
  - `POST /api/auth/login` → Replace mock login
  - `POST /api/auth/register` → Replace mock registration
  - `GET /api/auth/me` → Replace localStorage user fetch
  - `POST /api/auth/logout` → Clear token only (localStorage acceptable)

#### `src/services/admin.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `localStorage.getItem('geezle_user')` for user list
  - `localStorage.getItem(LOCAL_GIGS_KEY)` for gigs
  - `localStorage.getItem(LOCAL_JOBS_KEY)` for jobs
  - `localStorage.getItem(LOCAL_CATS_KEY)` for categories
  - `Promise.resolve([])` for subscribers, analytics
  - Hardcoded mock users array
- **API Endpoints:**
  - `GET /api/admin/users` → Replace localStorage user list
  - `GET /api/admin/gigs` → Replace localStorage gigs
  - `GET /api/admin/jobs` → Replace localStorage jobs
  - `GET /api/admin/categories` → Replace localStorage categories
  - `GET /api/admin/subscribers` → Replace Promise.resolve
  - `GET /api/admin/analytics` → Replace Promise.resolve
  - `PATCH /api/admin/users/:id` → Replace localStorage update

#### `src/services/community.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `USE_MOCK_API` flag with extensive mock data
  - `localStorage.getItem(this.storageKey)` for settings
  - `getMockData()`, `getMockThreads()`, `getMockComments()`, etc.
  - `handleMockPost()` for all POST operations
- **API Endpoints:**
  - `GET /api/community/settings` → Replace localStorage
  - `GET /api/community/threads` → Replace getMockThreads()
  - `GET /api/community/comments` → Replace getMockComments()
  - `GET /api/community/clubs` → Replace getMockClubs()
  - `GET /api/community/events` → Replace getMockEvents()
  - `GET /api/community/analytics` → Replace getMockAnalytics()
  - `POST /api/community/*` → Replace handleMockPost()

#### `src/services/cms.ts` ⚠️ **PARTIALLY MIGRATED**
- **Issues:**
  - `fallbackData` object with hardcoded pages, categories
  - Mock media item creation
  - Some endpoints use API, others use fallbacks
- **API Endpoints:**
  - `GET /api/cms/homepage` → Already implemented, remove fallbacks
  - `GET /api/cms/footer` → Remove fallback data
  - `GET /api/cms/pages` → Remove hardcoded pages array
  - `PUT /api/cms/homepage` → Ensure emits socket event

#### `src/services/support.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `localStorage.getItem(STORAGE_KEY)` for tickets
  - `INITIAL_TICKETS` hardcoded array
  - `INITIAL_CATEGORIES` hardcoded array
- **API Endpoints:**
  - `GET /api/support/tickets` → Replace localStorage
  - `GET /api/support/categories` → Replace hardcoded array
  - `POST /api/support/tickets` → Replace localStorage setItem
  - `POST /api/support/tickets/:id/replies` → Replace localStorage update

#### `src/services/gcoin.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `localStorage.getItem(GCOIN_WALLET_KEY)` for wallet
  - `localStorage.getItem(GCOIN_TRANSACTIONS_KEY)` for transactions
  - Hardcoded conversion rates
- **API Endpoints:**
  - `GET /api/gcoin/wallet` → Replace localStorage
  - `GET /api/gcoin/transactions` → Replace localStorage
  - `POST /api/gcoin/convert` → Replace localStorage update

#### `src/services/contract.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `localStorage.getItem(CONTRACTS_KEY)` for contracts
  - `localStorage.getItem(TIME_ENTRIES_KEY)` for time entries
- **API Endpoints:**
  - `GET /api/contracts` → Replace localStorage
  - `GET /api/contracts/:id/time-entries` → Replace localStorage
  - `POST /api/contracts/:id/time-entries` → Replace localStorage

#### `src/services/messaging.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `localStorage.getItem(CONVERSATIONS_KEY)` for conversations
  - `localStorage.getItem(MESSAGES_KEY)` for messages
- **API Endpoints:**
  - `GET /api/messages/conversations` → Replace localStorage
  - `GET /api/messages/conversations/:id` → Replace localStorage
  - `POST /api/messages` → Replace localStorage

#### `src/services/user.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `localStorage.getItem()` for user profile
  - Mock profile data
- **API Endpoints:**
  - `GET /api/users/me/profile` → Replace localStorage
  - `PUT /api/users/me/profile` → Replace localStorage

#### `src/services/files.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - Mock file upload responses
- **API Endpoints:**
  - `POST /api/files/upload` → Replace mock response

#### `src/services/ads.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `localStorage.getItem()` for ad campaigns
  - Mock ad data
- **API Endpoints:**
  - `GET /api/ads/campaigns` → Replace localStorage
  - `POST /api/ads/campaigns` → Replace localStorage

#### `src/services/marketing.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `Promise.resolve()` with mock marketing data
- **API Endpoints:**
  - `GET /api/marketing/campaigns` → Replace Promise.resolve
  - `GET /api/marketing/analytics` → Replace Promise.resolve

#### `src/services/payment.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - Mock payment intents
  - Hardcoded Stripe responses
- **API Endpoints:**
  - `POST /api/payments/stripe/intent` → Replace mock
  - `POST /api/payments/stripe/connect/onboard` → Replace mock

#### `src/services/ai/*.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `src/services/ai/forecasting.service.ts` → `Promise.resolve()` with hardcoded forecasts
  - `src/services/ai/skills.service.ts` → `localStorage.getItem(CERTS_KEY)`
  - `src/services/ai/ai.config.ts` → `localStorage.getItem(STORAGE_KEY)`
  - `src/services/ai/providers/gemini.provider.ts` → Mock tag responses
- **API Endpoints:**
  - `GET /api/ai/forecasts` → Replace Promise.resolve
  - `GET /api/ai/skills/certifications` → Replace localStorage
  - `GET /api/ai/config` → Replace localStorage
  - `POST /api/ai/generate-tags` → Replace mock response

### 1.2 Frontend Contexts

#### `src/context/UserContext.tsx` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `localStorage.getItem('user')` for initial state
  - Should hydrate from `GET /api/auth/me` on mount

#### `src/context/FavoritesContext.tsx` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `localStorage.getItem()` for favorites
- **API Endpoints:**
  - `GET /api/users/me/favorites` → Replace localStorage
  - `POST /api/users/me/favorites` → Replace localStorage

### 1.3 Frontend Components & Pages

#### `src/main/Landing.tsx` ⚠️ **PARTIALLY MIGRATED**
- **Issues:**
  - Fallback mock sections when API fails
  - Mock slides array
- **Action:** Remove fallbacks, ensure CMS API always returns data

#### `src/components/sections/*.tsx` ⚠️ **REVIEW NEEDED**
- **Issues:**
  - Some components may have hardcoded data
- **Action:** Audit each section component for hardcoded values

### 1.4 Backend Controllers

#### `src/controllers/commerceController.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `mockGigs` array hardcoded
  - `mockJobs` array hardcoded
  - Returns mock data instead of Prisma queries
- **Action:** Replace with Prisma queries from `Gig` and `Job` models

#### `src/controllers/adminController.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - `mockSystemSettings` object
  - `mockCategories` array
  - `Promise.resolve([])` for fraud alerts, analytics
- **Action:** Replace with Prisma queries from `Settings`, `Category`, `AdminAuditLog` models

#### `src/controllers/cmsController.ts` ⚠️ **PARTIALLY MIGRATED**
- **Issues:**
  - Some endpoints use mock data
  - May not emit socket events on updates
- **Action:** Ensure all endpoints use Prisma, emit `settings:updated` on PUT

#### `src/controllers/auth.controller.ts` ⚠️ **REVIEW NEEDED**
- **Issues:**
  - May have mock responses
- **Action:** Verify all endpoints use Prisma User model

#### `src/controllers/commerce.controller.ts` ⚠️ **NEEDS MIGRATION**
- **Issues:**
  - Mock gig/job responses
- **Action:** Replace with Prisma queries

#### `src/middleware/auth.middleware.ts` ⚠️ **NEEDS FIX**
- **Issues:**
  - Development bypass creates mock user
  - Production code commented out
- **Action:** Enable production JWT validation, remove mock user

#### `src/middleware/dev.middleware.ts` ⚠️ **REVIEW NEEDED**
- **Issues:**
  - May contain mock data injection
- **Action:** Ensure only used in development, disabled in production

#### `src/data/mockData.ts` ⚠️ **DELETE AFTER MIGRATION**
- **Issues:**
  - Centralized mock data file
- **Action:** Delete after all services migrated

### 1.5 Constants & Types

#### `src/constants.ts` ⚠️ **REVIEW NEEDED**
- **Issues:**
  - `MOCK_GIGS`, `MOCK_JOBS`, `CATEGORIES` arrays
  - `INITIAL_CURRENCIES` array (may be acceptable as reference data)
- **Action:** 
  - Remove `MOCK_GIGS`, `MOCK_JOBS`
  - Keep `INITIAL_CURRENCIES` if used as seed data only
  - Move `CATEGORIES` to database

---

## 2. API Endpoint Mapping

### 2.1 Auth Endpoints
| Frontend Service | Current Mock | Backend Endpoint | Status |
|-----------------|--------------|-----------------|--------|
| `auth.ts` login | localStorage + mock user | `POST /api/auth/login` | ⚠️ Needs implementation |
| `auth.ts` register | mock user | `POST /api/auth/register` | ⚠️ Needs implementation |
| `auth.ts` getCurrentUser | localStorage | `GET /api/auth/me` | ⚠️ Needs implementation |
| `auth.ts` logout | localStorage.removeItem | `POST /api/auth/logout` | ✅ Token only (acceptable) |

### 2.2 Admin Endpoints
| Frontend Service | Current Mock | Backend Endpoint | Status |
|-----------------|--------------|-----------------|--------|
| `admin.ts` getUsers | localStorage + hardcoded array | `GET /api/admin/users` | ⚠️ Needs implementation |
| `admin.ts` getGigs | localStorage | `GET /api/admin/gigs` | ⚠️ Needs implementation |
| `admin.ts` getJobs | localStorage | `GET /api/admin/jobs` | ⚠️ Needs implementation |
| `admin.ts` getCategories | localStorage | `GET /api/admin/categories` | ⚠️ Needs implementation |
| `admin.ts` getSubscribers | Promise.resolve([]) | `GET /api/admin/subscribers` | ⚠️ Needs implementation |
| `admin.ts` getAnalytics | Promise.resolve({}) | `GET /api/admin/analytics` | ⚠️ Needs implementation |

### 2.3 Commerce Endpoints
| Frontend Service | Current Mock | Backend Endpoint | Status |
|-----------------|--------------|-----------------|--------|
| `commerce.ts` getGigs | API call (good) | `GET /api/commerce/gigs` | ✅ Working |
| `commerce.ts` getGigById | API call (good) | `GET /api/commerce/gigs/:id` | ✅ Working |
| `commerceController.ts` | mockGigs array | `GET /api/commerce/gigs` | ⚠️ Backend needs Prisma |

### 2.4 CMS Endpoints
| Frontend Service | Current Mock | Backend Endpoint | Status |
|-----------------|--------------|-----------------|--------|
| `cms.ts` getHomepage | API + fallback | `GET /api/cms/homepage` | ⚠️ Remove fallback |
| `cms.ts` saveHomepage | API call | `PUT /api/cms/homepage` | ⚠️ Ensure socket emit |
| `cms.ts` getFooter | fallback data | `GET /api/cms/footer` | ⚠️ Needs implementation |

### 2.5 Wallet Endpoints
| Frontend Service | Current Mock | Backend Endpoint | Status |
|-----------------|--------------|-----------------|--------|
| `wallet.ts` getWallet | ✅ Migrated | `GET /api/wallet/me` | ✅ Complete |
| `wallet.ts` getTransactions | ✅ Migrated | `GET /api/wallet/me/transactions` | ✅ Complete |
| `wallet.ts` getEscrows | ✅ Migrated | `GET /api/wallet/me/escrows` | ✅ Complete |

### 2.6 Community Endpoints
| Frontend Service | Current Mock | Backend Endpoint | Status |
|-----------------|--------------|-----------------|--------|
| `community.ts` getSettings | localStorage | `GET /api/community/settings` | ⚠️ Needs implementation |
| `community.ts` getThreads | getMockThreads() | `GET /api/community/threads` | ⚠️ Needs implementation |
| `community.ts` getComments | getMockComments() | `GET /api/community/comments` | ⚠️ Needs implementation |
| `community.ts` getClubs | getMockClubs() | `GET /api/community/clubs` | ⚠️ Needs implementation |
| `community.ts` getEvents | getMockEvents() | `GET /api/community/events` | ⚠️ Needs implementation |

### 2.7 Support Endpoints
| Frontend Service | Current Mock | Backend Endpoint | Status |
|-----------------|--------------|-----------------|--------|
| `support.ts` getTickets | localStorage | `GET /api/support/tickets` | ⚠️ Needs implementation |
| `support.ts` getCategories | hardcoded array | `GET /api/support/categories` | ⚠️ Needs implementation |
| `support.ts` createTicket | localStorage | `POST /api/support/tickets` | ⚠️ Needs implementation |

### 2.8 AI Endpoints
| Frontend Service | Current Mock | Backend Endpoint | Status |
|-----------------|--------------|-----------------|--------|
| `ai/forecasting.service.ts` | Promise.resolve([]) | `GET /api/ai/forecasts` | ⚠️ Needs implementation |
| `ai/skills.service.ts` | localStorage | `GET /api/ai/skills/certifications` | ⚠️ Needs implementation |

---

## 3. Missing Dependencies

### 3.1 Validation Libraries
- **Missing:** `zod` or `joi` for request validation
- **Current:** `express-validator` installed but not consistently used
- **Action:** Add `zod` for TypeScript-first validation
  ```bash
  npm install zod
  ```

### 3.2 Logging Libraries
- **Missing:** Structured logging (`pino` or `winston`)
- **Current:** `console.log`/`console.error` throughout
- **Action:** Add `pino` for production logging
  ```bash
  npm install pino pino-pretty
  ```

### 3.3 Error Handling
- **Missing:** Centralized error handler middleware
- **Current:** Inconsistent error responses
- **Action:** Create `src/middleware/errorHandler.ts`

### 3.4 RBAC Middleware
- **Missing:** Type-safe RBAC middleware
- **Current:** `adminMiddleware` exists but needs typing
- **Action:** Enhance with `AuthRequest` typing

### 3.5 Webhook Validation
- **Missing:** Stripe webhook signature validation
- **Current:** Basic webhook handler exists
- **Action:** Add `stripe.webhooks.constructEvent()` validation

### 3.6 Rate Limiting
- **Status:** ✅ `express-rate-limit` installed
- **Action:** Ensure all auth endpoints have rate limiting

### 3.7 Database Migrations
- **Status:** ✅ Prisma installed
- **Action:** Run migrations after schema updates

---

## 4. Prioritized 5-Phase Fix Plan

### Phase 1: Auth & User Management (Week 1)
**Priority:** CRITICAL - Foundation for all other features

**Tasks:**
1. ✅ Complete Prisma schema alignment (Wallet done)
2. Implement `POST /api/auth/login` with JWT
3. Implement `POST /api/auth/register` with Prisma
4. Implement `GET /api/auth/me` with Prisma
5. Migrate `UserContext.tsx` to use `GET /api/auth/me`
6. Remove localStorage user storage (keep token only)
7. Enable production JWT validation in `auth.middleware.ts`
8. Add request validation with `zod` for auth endpoints
9. Add structured logging with `pino`

**Acceptance Criteria:**
- Users can register/login and get JWT
- UserContext hydrates from API
- No localStorage for user data (token only)
- RBAC enforced on protected routes

---

### Phase 2: CMS & Homepage (Week 1-2)
**Priority:** HIGH - Core user experience

**Tasks:**
1. Create `CMSConfig` Prisma model (if not exists)
2. Implement `GET /api/cms/homepage` with Prisma
3. Implement `PUT /api/cms/homepage` with Prisma + socket emit
4. Implement `GET /api/cms/footer` with Prisma
5. Implement `PUT /api/cms/footer` with socket emit
6. Remove all fallback data from `cms.ts`
7. Ensure `ContentContext` listens to `settings:updated` socket event
8. Test real-time updates across 2 browser sessions

**Acceptance Criteria:**
- Homepage sections stored in database
- Admin updates homepage → all users see changes instantly (socket)
- No fallback/mock data in CMS service
- Landing.tsx renders dynamic sections only

---

### Phase 3: Marketplace (Gigs, Jobs, Orders) (Week 2-3)
**Priority:** HIGH - Core business logic

**Tasks:**
1. Replace `mockGigs` in `commerceController.ts` with Prisma
2. Replace `mockJobs` in `commerceController.ts` with Prisma
3. Implement `GET /api/gigs` with filters, pagination
4. Implement `POST /api/gigs` (FREELANCER only)
5. Implement `GET /api/jobs` with filters, pagination
6. Implement `POST /api/jobs` (CLIENT only)
7. Implement `POST /api/orders` (order creation)
8. Implement `GET /api/orders/:id`
9. Migrate `admin.ts` getGigs/getJobs to API calls
10. Remove `MOCK_GIGS`, `MOCK_JOBS` from `constants.ts`
11. Remove localStorage gig/job storage

**Acceptance Criteria:**
- All gigs/jobs from database
- Orders created with escrow
- Admin can approve/reject listings
- No mock data in commerce controllers

---

### Phase 4: Wallet, Escrow, Payments (Week 3-4)
**Priority:** CRITICAL - Financial operations

**Tasks:**
1. ✅ Wallet endpoints already created
2. Implement `POST /api/escrow/fund` (Stripe PaymentIntent)
3. Implement `POST /api/escrow/release` (admin/client)
4. Implement `POST /api/escrow/refund` (admin)
5. Implement `POST /api/payments/stripe/intent`
6. Implement `POST /api/payments/stripe/webhook` with signature validation
7. Implement `POST /api/payments/stripe/connect/onboard` (freelancer)
8. Create `WebhookLog` Prisma model and persist all webhooks
9. Implement idempotency for webhook processing
10. Add audit logging for all financial transactions
11. Test escrow flow: fund → hold → release → payout

**Acceptance Criteria:**
- Escrow funded via Stripe
- Escrow released to freelancer wallet
- Webhooks validated and logged
- All transactions in database
- No localStorage for financial data

---

### Phase 5: Realtime, Chat, Community (Week 4-5)
**Priority:** MEDIUM - Enhanced features

**Tasks:**
1. Ensure Socket.io emits `settings:updated` on CMS changes
2. Ensure Socket.io emits `order:created`, `order:updated`
3. Implement `GET /api/orders/:id/messages`
4. Implement `POST /api/orders/:id/messages`
5. Emit `message:new` socket event on message creation
6. Migrate `messaging.ts` from localStorage to API
7. Implement community endpoints (if needed)
8. Migrate `community.ts` from mock data to API
9. Test real-time updates across multiple sessions

**Acceptance Criteria:**
- CMS updates propagate via socket
- Order messages work in real-time
- No localStorage for messages/conversations
- Socket events observable in browser

---

## 5. Additional Critical Items

### 5.1 Type Safety
- Replace all `req: any` with `AuthRequest` interface
- Add request body validation with `zod`
- Ensure Prisma types match frontend types

### 5.2 Error Handling
- Create centralized error handler
- Consistent error response format
- Log all errors with context

### 5.3 Security
- Enable JWT validation in production
- Add rate limiting to auth endpoints
- Validate all webhook signatures
- Sanitize user inputs

### 5.4 Testing
- Test each migrated endpoint
- Test socket events
- Test RBAC enforcement
- Test webhook idempotency

---

## 6. File Deletion List (After Migration)

Once all migrations are complete, delete these files:
- `src/data/mockData.ts` (backend)
- `src/constants.ts` (remove MOCK_GIGS, MOCK_JOBS only)
- All `getMock*()` methods from `community.ts`
- All `INITIAL_*` arrays from service files (except seed data)

---

## 7. Next Steps

1. **Review this audit** with team
2. **Prioritize phases** based on business needs
3. **Start Phase 1** (Auth & User Management)
4. **Track progress** in project management tool
5. **Test each phase** before moving to next

---

**End of Audit Report**
