# Phase 20.7 Part 3 — Test Report

## Unit tests (pre-merge / post-fix)

| Suite | Result |
|---|---|
| FE `scrolithaMessagingNormalize.test.ts` | **3 pass** |
| FE messaging media suite (prior) | **20 pass** (combined earlier 23) |
| BE `scrolitha.messagingBridge.spec.ts` | **4 pass** |

## Build

| Build | Image | Status |
|---|---|---|
| FE Cloud Build `93de3ea9-2ea2-40f9-9148-6716532b2615` | `scrolith-frontend:p207-1c7b9f5e` | **SUCCESS** |
| BE Cloud Build `179b9657-9a8f-4405-900a-8f733d7862c5` | `scrolith-backend:p207-07d4b99c` | **SUCCESS** |

## Production smoke (unauthenticated)

| Check | Result |
|---|---|
| https://scrolith.com/ | **200** |
| https://scrolith.com/messages | **200** |
| p207 FE tagged URL | **200** |
| `/api/scrolitha/platform-identity` | **200** · username `scrolitha` · isVerified true |
| `/api/messages/scrolitha/ensure` unauth | **401** |
| `/api/files/content/test-id` HEAD | **404** (auth/not found path alive) |

## Authenticated functional matrix

| Area | Status |
|---|---|
| Ensure DM as staff (internal rollout) | **Pending operator session** |
| Send/receive AI reply | **Pending operator session** |
| Dock / SupportWidget | **Pending operator session** |
| Android / Desktop wrappers | **Code path inherited**; interactive **pending operator** |

## Regression probes

| Area | Status |
|---|---|
| Human messaging API surface unchanged | Code review **Pass** |
| Media content URLs (20.6) | Endpoint alive **Pass** |
| Dashboard routes shell | Homepage/messages 200 **Pass** |
