# Phase 20.7 — Messaging Dock Overlap Root Cause

**Severity:** P1 UX regression  
**Surface:** `/messages`, `/messages/*`  
**Date:** 2026-07-18

## Root cause

`DesktopMessagingDock` is mounted globally from the authenticated application shell in `App.tsx` whenever:

- user is authenticated  
- non-admin, non-mobile-shell, non-standalone routes  
- `nonCriticalUiReady`

A route flag **`isMessagesRoute`** already existed (`/^\/messages(\/|$)/`) and was used for other shell policies, but **was not applied to the dock mount condition**.

Therefore the floating dock (body portal, z-index ~35) remained mounted over the dedicated full-page Messages workspace, overlapping content.

## Answers to audit questions

| # | Finding |
|---|---|
| 1 | Mounted in `App.tsx` via lazy `DesktopMessagingDock` |
| 2 | Yes — global authenticated shell |
| 3 | Yes — `useLocation` / `isMessagesRoute` already available |
| 4 | No dock exclusion policy was applied to the mount |
| 5 | N/A — fully rendered portal, not CSS-only hide |
| 6 | Single component instance (no dual docks found) |
| 7 | Desktop viewport gated inside dock (`min-width: 1024px`) |
| 8 | Yes — `createPortal` to `document.body` |
| 9 | Open windows/expanded state live in `MessageContext` |
| 10 | Messages page is full workspace; dock is separate global chrome |

## Fix principle

Unmount (do not z-index/opacity/margin) the visual dock on `/messages` and `/messages/*` via centralized `shouldShowMessagingDock(pathname)`, applied at App mount + dock defense-in-depth.
