
# AtMyWorks Project Manifest

## 1. Project Overview
**Name:** AtMyWorks (Scrolith)
**Type:** Freelance Marketplace (Upwork/Fiverr clone)
**Stack:** React (Vite) + Node.js (Express) + PostgreSQL (Prisma)
**Current State:** Frontend Complete (Mocked Services), Backend Skeleton Ready.

## 2. File Inventory & Architecture

### Core Configuration
- `package.json`: Dependencies and scripts.
- `vite.config.ts`: Build configuration.
- `tailwind.config.js`: Styling (Implied).
- `tsconfig.json`: TypeScript config.

### Frontend (`src/`)
**Entry Points:**
- `index.html`: Main entry (Needs to point to `src/index.tsx`).
- `src/main.tsx` (or `index.tsx`): React Root.
- `src/App.tsx`: Router & Layout Wrapper.
- `src/types.ts`: Global TypeScript definitions.

**Context Providers (State):**
- `UserContext`: Auth & Profile state.
- `CurrencyContext`: Multi-currency support.
- `NotificationContext`: Toasts & Alerts.
- `ContentContext`: CMS data.
- `SocketContext`: Real-time features.
- `MessageContext`: Chat state.
- `FavoritesContext`: Saved items.

**Services (API Layer):**
- `api.ts`: Axios/Fetch wrapper.
- `auth.ts`, `user.ts`: User management.
- `cms.ts`: Content management system.
- `search.ts`: Search & Trending logic.
- `gcoin.ts`: Internal currency logic.
- `wallet.ts`: Payments & Escrow.
- `marketing.ts`: Ads & Affiliates.
- `community.ts`: Forums & Clubs.
- `support.ts`: Ticketing system.
- `contract.ts`: Hourly contracts & Time tracking.
- `files.ts`: File upload handling.
- `ai/*.ts`: AI Providers (Gemini/OpenAI) & specialized services (Fraud, Matching).

**UI Components:**
- **Navigation:** `Navbar`, `DynamicFooter`, `SupportWidget`.
- **Marketplace:** `GigCard`, `SearchInput`, `Recommendations`, `TrendingCategoriesStrip`.
- **Community:** `InteractionBar`, `CommentSystem`, `ShareModal`.
- **Inputs:** `FilePicker`, `RichTextEditor`.
- **Special:** `ATMTracker`, `AdCard`, `ReputationBadge`.

**Pages & Routes:**
- **Public:** `Landing`, `BrowseTalent`, `BrowseJobs`, `SearchResults`, `GigDetail`, `JobDetail`.
- **Auth:** `Login`, `Signup`.
- **Dashboards:** 
  - `AdminDashboard` (Modules: Overview, Users, Finance, CMS, AI, etc.)
  - `FreelancerDashboard` (Modules: Gigs, Orders, Wallet)
  - `ClientDashboard` (Modules: Jobs, Hires, Escrow)
- **Community:** `Forum`, `Clubs`, `Events`, `Chat`, `Leaderboard`.
- **CMS:** `Blog`, `BlogPost`, `StaticPage`.

### Backend (`server/`)
- `server.ts`: Express App entry.
- `routes/*.ts`: API Route definitions.
- `controllers/*.ts`: Business logic (currently mocks/stubs).
- `prisma/schema.prisma`: Database definition (To be created).

## 3. Critical Next Steps (Roadmap)

1.  **Structure Fix:** Move all source files (`components`, `pages`, `services`, etc.) into `src/` to resolve Vite import errors.
2.  **Database Setup:** Install PostgreSQL and define Prisma Schema.
3.  **Backend Logic:** Replace mock controllers with real DB queries.
4.  **Authentication:** Switch from local storage mock auth to real JWT/Session auth.
5.  **Storage:** Connect AWS S3/Backblaze for real file uploads.

