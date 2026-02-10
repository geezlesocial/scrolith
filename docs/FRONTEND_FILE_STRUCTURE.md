# Frontend File Structure & Routing Blueprint (Scrolith Dashboards)

Overview
- All dashboard pages live under `src/dashboard/` with `freelancer/`, `employer/`, and `shared/`.
- `src/services/*` implement API calls; UI components read only from services.
- `src/context/RealtimeProvider.tsx` implements Socket.IO + fallback polling.

Directory tree (exact)
```
src/
  dashboard/
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

  services/
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
    messages.ts
    api.ts

  context/
    UserContext.tsx
    RealtimeContext.tsx (thin wrapper around RealtimeProvider)

  pages/
    DashboardRouter.tsx

  App.tsx
  main.tsx
```

Routing blueprint (preserve existing patterns)
- Use route patterns and query-tab compatibility:
  - Freelancer overview default: `/freelancer/dashboard` or `/freelancer/dashboard?tab=overview` or `/freelancer/dashboard/overview`
  - Employer overview default: `/client/dashboard` OR `/employer/dashboard`
- Router mapping (example using React Router v7):
```
<Routes>
  <Route path="/freelancer/dashboard" element={<ProtectedRoute role="FREELANCER"><DashboardLayout /></ProtectedRoute>}>
    <Route index element={<Overview />} />
    <Route path="overview" element={<Overview />} />
    <Route path="gigs" element={<MyGigs />} />
    <Route path="orders" element={<Orders />} />
    <Route path="wallet" element={<Wallet />} />
    <Route path="withdrawals" element={<Withdrawals />} />
    <Route path="messages" element={<Messages />} />
    <Route path="notifications" element={<Notifications />} />
    <Route path="profile" element={<Profile />} />
    <Route path="kyc" element={<KYC />} />
    <Route path="hourly" element={<HourlyWork />} />
    <Route path="files" element={<UploadedFiles />} />
    <Route path="settings" element={<Settings />} />
  </Route>

  <Route path="/client/dashboard" element={<ProtectedRoute role="EMPLOYER"><DashboardLayout /></ProtectedRoute>}>
    <Route index element={<Overview />} />
    <Route path="jobs" element={<MyJobs />} />
    <Route path="proposals" element={<ProposalsOffers />} />
    <Route path="contracts" element={<Contracts />} />
    <Route path="escrow" element={<Escrow />} />
    <Route path="messages" element={<Messages />} />
    <Route path="notifications" element={<Notifications />} />
    <Route path="favorites" element={<Favorites />} />
    <Route path="briefs" element={<ProjectBriefs />} />
    <Route path="files" element={<UploadedFiles />} />
    <Route path="settings" element={<Settings />} />
  </Route>

  <Route path="/admin/*" element={<ProtectedRoute role="ADMIN"><AdminLayout/></ProtectedRoute>} />
</Routes>
```

Routing rules
- `ProtectedRoute` reads `useUser()` and verifies `role`.
- Query `?tab=` support: `DashboardLayout` reads `tab` and navigates to correct sub-route using `useNavigate`.
- Deep linking: each tab has a unique URL to enable bookmarking and tests.

Data flow rules
- Components call service functions in `src/services/*`.
- Services handle normalization and errors, returning typed payloads.
- State management: prefer local component state + `RealtimeProvider` updates; add React Query later if needed.

UI patterns
- Every list uses `Table.tsx` with server pagination.
- Use `Skeleton.tsx` for initial loading.
- Confirm actions use `ConfirmModal.tsx`.
- File selection always uses `FilePickerModal.tsx` (uploads into global `Uploaded Files`).

Accessibility & Responsiveness
- All modals focus-trap.
- Buttons have aria-labels and keyboard support.


