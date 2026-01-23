# Frontend File Structure & Routing Blueprint — Dashboards

This document defines the exact file structure and route mapping for Freelancer and Employer dashboards. All files live under `src/dashboard`.

Recommended structure:

src/dashboard/
  freelancer/
    Overview.tsx
    MyGigs.tsx
    Orders.tsx
    Wallet.tsx
    Withdrawals.tsx
    Messages.tsx
    Notifications.tsx
    Profile.tsx
    KYC.tsx
    HourlyWork.tsx
    UploadedFiles.tsx
    Settings.tsx
  employer/
    Overview.tsx
    MyJobs.tsx
    ProposalsOffers.tsx
    Contracts.tsx
    Escrow.tsx
    Messages.tsx
    Notifications.tsx
    Favorites.tsx
    ProjectBriefs.tsx
    UploadedFiles.tsx
    Settings.tsx
  shared/
    DashboardLayout.tsx
    StatusBadge.tsx
    Table.tsx
    EmptyState.tsx
    Skeleton.tsx
    ConfirmModal.tsx
    FilePickerModal.tsx
    RealtimeProvider.tsx
    NotificationBell.tsx
    UnreadCounter.tsx

Services (API layer):
src/services/
  freelancer.ts
  employer.ts
  gigs.ts
  jobs.ts
  orders.ts
  contracts.ts
  wallet.ts
  withdrawals.ts
  kyc.ts
  files.ts
  notifications.ts
  proposals.ts
  briefs.ts
  messaging.ts

Routing
- Preserve existing route patterns. Recommended top-level routes:
  - /freelancer/dashboard (default tab Overview)
  - /freelancer/dashboard/:tab (tab mapping)
  - /employer/dashboard (default tab Overview)
  - /employer/dashboard/:tab

Router mapping example (pseudo):
- /freelancer/dashboard or /freelancer/dashboard/overview -> `freelancer/Overview.tsx`
- /freelancer/dashboard/my-gigs -> `freelancer/MyGigs.tsx`
- /freelancer/dashboard/orders -> `freelancer/Orders.tsx`
- /freelancer/dashboard/messages -> `freelancer/Messages.tsx`
- /freelancer/dashboard/uploaded-files -> `freelancer/UploadedFiles.tsx`
- /employer/dashboard/my-jobs -> `employer/MyJobs.tsx`
- /employer/dashboard/project-briefs -> `employer/ProjectBriefs.tsx`

Routing rules & guards
- Role-based guard middleware on route entry: verify token role matches route (freelancer <-> employer). Redirect to 403 or home otherwise.
- Preserve query param option: `/freelancer/dashboard?tab=orders` should map to Orders view as well.
- Default to Overview when unknown tab.

Component responsibilities
- `DashboardLayout.tsx`: renders sidebar, topbar, and <Outlet />. Sidebar items built from config mapping tab keys to routes and labels.
- `RealtimeProvider.tsx`: provides socket connection and fallback polling; exposes hooks `useRealtime()` and `useSubscribe(event, handler)`.
- `FilePickerModal.tsx`: opens uploaded files list and upload flow; returns selected file ids.
- All page components call services in `src/services/*`. No direct axios calls in components.

Data flow
- Components -> Services -> `src/services/api.ts` axios instance -> Backend
- Services return data shaped to the contract; components use React Query or equivalent to fetch/cached data.

UI patterns & conventions
- All lists use `Table.tsx` for sorting/filtering; large lists use pagination/virtualization.
- Use `StatusBadge.tsx` for statuses across gigs/jobs/contracts.
- Use skeleton loaders for list loading states.
- All mutate actions must show loading, handle error, and re-fetch or optimistically update when safe.

End of blueprint.
