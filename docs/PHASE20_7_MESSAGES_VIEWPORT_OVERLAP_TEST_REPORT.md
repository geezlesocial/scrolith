# Phase 20.7 Messages Viewport — Test Report

## Unit tests

| Suite | Result |
|---|---|
| `messagesWorkspaceLayout.test.ts` | **Pass** |
| `messagingDockRouteVisibility.test.ts` | **Pass** (dock exclusion retained) |
| `scrolithaMessagingNormalize.test.ts` | **Pass** |

## Layout contracts verified

- Desktop composer min 52 / max 168 → internal scroll after max  
- History class requires `flex-1` + `min-h-0` + `overflow-y-auto`  
- Composer region is not sticky/fixed  
- Scrolitha chips `flex-nowrap` + `overflow-x-auto`  
- Dock still excluded on `/messages`  

## Build

| Check | Result |
|---|---|
| `npm run build` | **Pass** |
| Cloud Build | **SUCCESS** `e6cc73c0-1774-4b02-9501-c9a83ef0fc45` |
| Image | `scrolith-frontend:p2072-57f5e366` |
