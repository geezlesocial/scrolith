# Scrolith Platform Report and Guide

## 1. Executive Summary

Scrolith is a full-stack social-professional platform that combines:

- community publishing
- freelance marketplace workflows
- short-form video and live streaming
- AI-assisted productivity
- monetization and wallet systems
- admin-controlled platform operations

Based on the current codebase, Scrolith is best understood as an **AI-powered social freelance marketplace** with creator, community, and operator tooling built into one system.

This report is intentionally evidence-based. It distinguishes between:

- what is directly confirmed in code
- what is strongly implied by the system structure
- what should be treated as product positioning rather than proven runtime capability

## 2. Proof Boundaries

### 2.1 What this report confirms

This report confirms features and architecture that are directly visible in one or more of the following:

- frontend modules and route structure in `geezle/src`
- backend routes, controllers, services, and server bootstrap in `geezle-backend/src`
- Prisma schema in `geezle-backend/prisma/schema.prisma`
- package dependencies and scripts in the frontend, backend, and mobile packages
- deployment assets such as `docker-compose.prod.yml`, Dockerfiles, and production env templates

### 2.2 What this report does not claim

This report does **not** independently prove:

- that every route is bug-free in production
- that every feature is fully mature or fully stable under load
- that every integration is configured in every environment
- that the current deployment has enterprise-grade redundancy, observability, or failover

Where the code shows a feature surface, this report treats that as **implemented platform scope**, not a guarantee of production perfection.

### 2.3 Reading guide

Use this document in three ways:

- as a business overview of what Scrolith is
- as a technical guide to how the platform is structured
- as a platform map for future scaling, documentation, and investment materials

## 3. Product Focus Framing

Scrolith is not a simple job board, not only a social network, and not only a creator app. The codebase points to a clearer product center:

**Scrolith is a social-professional commerce platform where users can build identity, publish content, discover work, transact, collaborate, and grow using AI-assisted tools.**

The strongest product pillars in the current system are:

1. **Professional identity and community**
   - profiles, posts, stories, comments, reactions, discussions, and social discovery
2. **Freelance and business workflows**
   - gigs, jobs, proposals, contracts, orders, escrow, briefs, reviews, and marketplace flows
3. **Creator and engagement systems**
   - Scroll short video, live streaming, gifting, sharing, reposting, and audience interaction
4. **AI and growth intelligence**
   - Scrolitha, insights, recommendations, opportunity matching, writing assistance, and productivity support
5. **Admin and runtime control**
   - CMS, homepage builders, moderation, monetization, payments, live controls, ads, and system settings

That is the clearest product-focus framing supported by the repository today.

## 4. Repository and System Layout

Scrolith is organized as a monorepo with three main runtime layers:

- `geezle/`
  - primary frontend application for web and the shared mobile web layer
- `geezle-backend/`
  - backend API, realtime server, business logic, and database layer
- `mobile/`
  - Capacitor wrapper that packages the web frontend as native mobile apps

Supporting infrastructure exists in:

- `docs/`
  - deployment and operational guides
- `deploy/docker/`
  - backend and frontend container definitions
- `deploy/nginx/`
  - frontend web serving configuration
- `docker-compose.prod.yml`
  - local production-style topology

This is a shared-platform architecture, not three unrelated applications.

## 5. Technology Stack

### 5.1 Frontend

The frontend is built with:

- React 19
- React Router 7
- Vite 6
- TypeScript
- Tailwind CSS
- Axios
- Socket.IO client
- Recharts
- MapLibre GL

This gives Scrolith:

- SPA navigation
- modular UI composition
- responsive layouts
- realtime UI connectivity
- charting and insights surfaces
- map and location-capable interfaces

### 5.2 Backend

The backend is built with:

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- Socket.IO
- Zod
- Helmet
- CORS
- express-rate-limit

This gives Scrolith:

- typed API services
- database-backed workflows
- realtime communication
- security middleware
- validation and platform governance controls

### 5.3 Mobile

The mobile app stack uses:

- Capacitor
- Capacitor Android
- Capacitor iOS
- Camera
- Filesystem
- Geolocation
- Preferences
- Push Notifications
- biometric-related native support

The mobile app is therefore a native shell over the shared web app, with access to device capabilities.

### 5.4 Integrations and platform services

The codebase also includes support for:

- Stripe
- Firebase Admin
- Nodemailer
- Azure Blob Storage
- Cloudinary
- OpenAI
- Google Generative AI
- Redis

These integrations support:

- payments and payouts
- email and notifications
- media/storage backends
- AI assistance
- caching and service coordination

## 6. Architecture Flow

### 6.1 High-level application flow

The platform architecture follows this path:

1. User loads Scrolith in web or mobile app
2. React frontend resolves route and renders the appropriate shell
3. Frontend services call backend API routes
4. Express routes dispatch into controllers
5. Controllers call services and Prisma-backed logic
6. Prisma reads and writes PostgreSQL
7. Socket.IO handles realtime updates for messaging, live state, notifications, and interactive surfaces

### 6.2 Frontend flow

The frontend is organized around feature and domain modules:

- `auth/`
- `community/`
- `dashboard/`
- `features/live/`
- `features/scroll/`
- `messages/`
- `mobile/`
- `profile/`
- `services/`
- `context/`
- `components/`

The route layer in `App.tsx` confirms that Scrolith serves:

- public landing and browse flows
- authenticated dashboard flows
- community routes
- Scroll routes
- live streaming routes
- mobile-specific home shells
- admin and developer surfaces

### 6.3 Backend flow

The backend follows a standard layered model:

- `routes/` expose APIs
- `controllers/` handle request orchestration
- `services/` contain business logic
- `middleware/` and `middlewares/` handle auth, maintenance, optimization, and safety
- `modules/` handle larger feature systems such as insights jobs
- `realtime/` and `server.ts` handle websocket behavior

This is a coherent application architecture rather than a collection of unrelated endpoints.

### 6.4 Realtime flow

The server bootstrap in `server.ts` confirms a dedicated Socket.IO server with:

- websocket and polling transport support
- frontend origin controls
- realtime connection handling

This underpins features such as:

- live streaming session signaling
- direct messaging presence and updates
- notification-style realtime behaviors
- interactive engagement updates

### 6.5 Mobile flow

`mobile/capacitor.config.ts` confirms:

- app id `com.scrolith.scrolith`
- shared web build from `../geezle/dist`
- native-capable runtime behavior for Android/iOS

This means feature delivery is primarily web-first, then packaged for mobile app distribution.

## 7. Deployment Topology

### 7.1 Confirmed container topology

The clearest confirmed deployment topology comes from `docker-compose.prod.yml`.

It defines three production-style services:

- `db`
  - PostgreSQL 15
- `backend`
  - Node/Express API container
  - binds port `5000`
  - mounts uploads directory
- `frontend`
  - static frontend served by Nginx
  - binds port `3000` externally and serves container port `80`

This is the current canonical local production topology visible in the repository.

### 7.2 Backend runtime topology

`deploy/docker/backend.Dockerfile` confirms that the backend container:

- installs dependencies
- copies source and Prisma assets
- runs `npm run prisma:generate`
- exposes port `5000`
- applies migrations at startup
- starts the server through `ts-node/register/transpile-only`

This means the backend runtime model is:

- source-driven Node execution in production container
- migration-aware startup
- Prisma-backed database boot sequence

### 7.3 Frontend runtime topology

`deploy/docker/frontend.Dockerfile` confirms that the frontend deployment path is:

1. build React app with Vite
2. inject build-time env values
3. copy `dist/` into Nginx
4. serve frontend as static assets through Nginx

This is a standard, production-ready static frontend topology.

### 7.4 Environment contract

`.env.production.example` shows the main runtime contract:

- app URLs
- database URL
- JWT secret
- storage driver
- email configuration
- Stripe and PayPal settings
- frontend build-time API URLs

This gives a clear boundary between:

- frontend build configuration
- backend runtime configuration
- database and third-party service configuration

### 7.5 Cloud deployment posture

The repository documentation in `docs/CLOUD_HOSTING_GUIDE.md` confirms intentional support for:

- Azure
- AWS
- Google Cloud

The guide is implementation-level, not only aspirational. It includes:

- build and push flow
- image deployment
- runtime env setup
- database and domain considerations

## 8. Data Model and Platform Scope

The Prisma schema confirms a broad domain model. Major entities include:

- users and profiles
- gigs and jobs
- proposals, orders, and contracts
- wallets and transactions
- Gcoin systems
- community posts, comments, reactions, and stories
- conversations and direct messages
- KYC and moderation entities
- monetization and payout entities
- insights, achievements, and opportunity matching
- developer platform entities

This confirms that Scrolith is architected as a multi-domain platform, not a narrow application.

## 9. Confirmed Product Systems

### 9.1 Identity and onboarding

Confirmed from frontend routes and schema:

- login
- signup
- forgot/reset password
- OAuth callback handling
- profile and settings management
- mobile biometric support

### 9.2 Community system

Confirmed from frontend modules, backend routes, and schema:

- community home
- posts
- comments and replies
- reactions
- stories
- forum
- clubs
- events
- channels/chat-related community modules
- leaderboards and knowledge surfaces

### 9.3 Scroll short-form media

Confirmed from `features/scroll/` and backend `scroll.routes.ts`:

- short-form video feed
- content overlays
- reactions and comments
- repost, send, dash, story, and report actions

### 9.4 Live streaming

Confirmed from `features/live/`, `live.routes.ts`, and admin live modules:

- live studio
- live viewer
- host/viewer session model
- realtime signaling path
- gifting/support flows
- admin live controls

### 9.5 Messaging and notifications

Confirmed from routes, schema, and frontend modules:

- direct messaging
- message reactions
- conversations
- notifications
- presence-oriented realtime behavior

### 9.6 Marketplace and commerce

Confirmed from routes and schema:

- gigs
- jobs
- proposals
- contracts
- orders
- reviews
- favorites
- cart
- briefs
- escrow-related routes

### 9.7 Monetization and wallet systems

Confirmed from backend routes and schema:

- wallet management
- Gcoin wallets and transactions
- conversion requests
- withdrawals
- monetization profiles and applications
- payout provider accounts
- Stripe payout-related routes

### 9.8 AI and Scrolitha

Confirmed from routes, services, package dependencies, and admin modules:

- AI routes
- Scrolitha routes
- AI admin management
- content assistance surfaces
- opportunity and insight-oriented intelligence entities

### 9.9 Insights and growth layer

Confirmed from routes and schema:

- professional score
- insight events
- achievements
- streaks
- opportunity matches
- skill gap reports
- topic follows
- feed intent signals

### 9.10 Admin and CMS control plane

Confirmed from `src/dashboard/admin` and route structure:

- homepage settings
- guest homepage builder
- mobile homepage
- community management
- live platform management
- Scrolitha management
- monetization management
- payment gateways
- finance and payouts
- uploaded files
- languages and text overrides
- users, support, and disputes
- system settings
- form builder
- market intelligence
- developer platform administration

This is one of Scrolith’s defining strengths: it includes a large internal control plane.

## 10. What Scrolith Can Do

Grounded in the current implementation, Scrolith can serve as:

### 10.1 A social-professional identity platform

Users can build presence through:

- profiles
- posts
- stories
- comments
- reactions
- public community activity

### 10.2 A work discovery and freelance platform

Users can:

- browse talent
- browse jobs
- publish gigs
- publish jobs
- submit proposals
- move through contract and order workflows

### 10.3 A creator platform

Users can:

- publish short-form video
- use Scroll
- go live
- receive support/gifts
- share and repost content

### 10.4 An AI-assisted growth platform

Users can:

- use writing and content assistance
- receive recommendation and insight signals
- interact with Scrolitha-managed surfaces
- access opportunity-oriented intelligence layers

### 10.5 An operator-managed platform

Admins can:

- turn features on or off
- control homepage experiences
- manage live policy and settings
- manage audience and ads configuration
- manage CMS and localization
- manage monetization and platform operations

## 11. User Roles and Operating Personas

The system structure supports multiple roles:

- guests
- authenticated members
- freelancers
- employers/clients
- creators/live hosts
- admins
- moderators and staff
- developers

This multi-role design is central to Scrolith’s architecture.

## 12. Design and UX Direction

The frontend codebase shows a design system oriented around:

- responsive multi-device layouts
- route-level lazy loading
- provider-based shared state
- modular cards, rails, overlays, and feed surfaces
- dedicated mobile shells
- admin-managed UI behavior

The platform’s design direction is a blend of:

- social familiarity
- professional utility
- marketplace workflows
- operator control

That is the right design posture for Scrolith’s product category.

## 13. Strengths of the Current Codebase

The clearest strengths visible in code are:

- broad but structured platform scope
- strong domain separation
- shared web/mobile delivery model
- substantial admin control plane
- integrated commerce + community + creator stack
- clear AI and insights direction
- monetization-ready data model
- realtime-capable infrastructure

## 14. Where the Platform Is Strongest Strategically

Scrolith is strongest when positioned as:

**a unified platform for professional identity, social engagement, freelance commerce, creator activity, and AI-assisted growth**

That framing is tighter and more accurate than calling it only:

- a freelance marketplace
- a social network
- a live app
- or a creator platform

Scrolith’s differentiator is the combination.

## 15. Concise Architecture Summary

The most accurate short architecture summary is:

- **Frontend:** React + Vite + TypeScript + Tailwind single-page app
- **Backend:** Express + Socket.IO + Prisma + PostgreSQL
- **Mobile:** Capacitor shell over the same frontend build
- **Realtime:** Socket.IO for interactive and live-capable flows
- **Media and integrations:** storage, notifications, payments, and AI providers
- **Operations:** a large admin control surface built into the product itself

## 16. Final Assessment

Scrolith already has the code structure of a serious digital platform.

It is not a toy app and not a narrow vertical build. The repository demonstrates a platform designed to support:

- identity
- community
- commerce
- creators
- AI
- monetization
- governance

What makes Scrolith valuable is not one isolated feature. It is the system-level combination of those layers in one architecture.

That is the clearest, most defensible reading of the codebase today.
