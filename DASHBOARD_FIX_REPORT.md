Dashboard Fix Report

Frontend
- Fixed module export/runtime errors for ConfirmModal and employer Overview.
- Removed non-ASCII artifacts in dashboard files and replaced with ASCII placeholders.
- Added Reviews service (`src/services/reviews.ts`) with snake_case to camelCase mapping.
- Added Likes/Favorites received endpoint support in `src/services/favorites.ts`.
- Added Freelancer Reviews (`src/dashboard/freelancer/Reviews.tsx`) and Likes (`src/dashboard/freelancer/Likes.tsx`) pages.
- Added Employer Reviews (`src/dashboard/employer/Reviews.tsx`) and Favorites (`src/dashboard/employer/Favorites.tsx`) pages.
- Wired new tabs in `src/dashboard/FreelancerDashboard.tsx` and `src/dashboard/ClientDashboard.tsx`.
- Added Admin Reviews moderation page and wired into `src/dashboard/AdminDashboard.tsx`.
- Replaced confirm() prompts in `src/dashboard/shared/ContractList.tsx` with ConfirmModal.
- Added conversion gating and error states in `src/dashboard/freelancer/WalletModule.tsx`.

Backend
- Implemented Favorites received endpoint (`GET /api/favorites/received`) with gig/profile counts and recent activity.
- Ensured favorites expanded, list, add, remove, admin list/top endpoints are DB-backed.
- Confirmed community settings, gcoin, reviews, support routes are mounted and available.

Notes
- All new/edited dashboard pages include loading, empty, and error states.
- All new APIs return `{ success: true, data: ... }` on success and `{ success: false, error: ... }` on error.
