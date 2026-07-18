# Phase 20.4 — Enterprise UX Audit Report

**Date:** 2026-07-18  
**Baseline:** Phase 20.3 production (`scrolith-frontend-00138-ruh` / `scrolith-backend-00114-bay`)

## Scope

Authenticated workspaces powered by `DashboardRouter` + `DashboardLayout` (live path). Legacy `FreelancerDashboard.tsx` / `ClientDashboard.tsx` are non-entry and were not revived.

## Information hierarchy (before)

| Area | Finding |
|---|---|
| Overview | Strong hero + KPI + activity pattern already present |
| Growth intelligence | GrowthPulseCard lived only on Member Home / profile |
| Navigation depth | Profile/Settings missing from Account sidebar |
| Mobile | Drawer nav works; overview rail stacks long on small screens |
| Empty/error/loading | Overview kit has skeletons; focus queues absent |
| AI | OpportunityStudioPanel present; weak growth CTAs |

## Improvement matrix

| Gap | Priority | Disposition |
|---|---|---|
| Embed Growth Pulse in workspace | P0 | **IMPLEMENTED** |
| Today's Focus / priorities queue | P0 | **IMPLEMENTED** |
| Status strip (orders / proposals / escrow) | P0 | **IMPLEMENTED** |
| Profile + Settings in sidebar | P0 | **IMPLEMENTED** |
| Reusable widget framework | P0 | **IMPLEMENTED** |
| Quick preview drawer primitive | P1 | **IMPLEMENTED** (framework) |
| Layout density/pin prefs API | P1 | **IMPLEMENTED** (client prefs) |
| Full widget drag-resize designer | P2 | **DEFER** — high UX risk, needs product design |
| Server-synced multi-device layouts | P2 | **DEFER** — needs profile settings schema |
| Revive escrow/candidates dedicated tabs | P2 | **DEFER** — features exist via contracts/browse |
| Admin merge into user workspace | N/A | Separate RBAC surface |
| Slack-class channels | DEFER | 20.2.8 product deferral |

## Accessibility notes

- New widgets use `aria-expanded`, `aria-labelledby`, focus-visible rings, Escape-to-close drawer.
- Status strip is a list with labels; focus items are keyboard-linkable.

## Mobile notes

- Status strip is 2-column on phone, 4 on `sm+`.
- Focus panel stacks above Opportunity Studio for priority-first scroll.
- Preview drawer uses bottom sheet on mobile, side panel on desktop.
