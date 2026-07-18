# Phase 20.7 Dock Overlap — Test Report

## Unit tests

| Suite | Result |
|---|---|
| `messagingDockRouteVisibility.test.ts` | **Pass** (path matrix) |
| `messagingSurfaces.test.ts` | **Pass** |
| `scrolithaMessagingNormalize.test.ts` | **Pass** |
| `messagingMedia.test.ts` | **Pass** |
| Combined run | **51 pass / 0 fail** |

## Path policy coverage

- Visible: `/`, `/home`, `/jobs`, `/marketplace`, `/communities`, `/profile/*`, `/settings`  
- Hidden: `/messages`, `/messages/`, `/messages/:id`, nested, query, hash  
- Not false-positive: `/direct-messages`, `/admin/messages`, `/user-messages`  

## Build

| Check | Result |
|---|---|
| `npm run build` | **Pass** (~50s) |
| Cloud Build `334a364f-2f07-44f0-836c-3a0c8f234fff` | **SUCCESS** image `p2071-81b6692b` |

## Production smoke

| Check | Result |
|---|---|
| https://scrolith.com/ | HTTP 200 |
| https://scrolith.com/messages | HTTP 200 |
| p2071 tagged FE | HTTP 200 |
| FE 100% revision | `scrolith-frontend-00149-siz` |
