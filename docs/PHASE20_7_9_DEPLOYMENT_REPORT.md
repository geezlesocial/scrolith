# Phase 20.7.9 — Deployment Report

## Pre-deploy

| Service | Revision |
|---|---|
| BE | scrolith-backend-00136-ziz (p2078) |
| FE | scrolith-frontend-00165-bef (p2079) |

## Flags to set on backend (progressive)

```
SCROLITHA_ROLLOUT_FILE_UNDERSTANDING=true
SCROLITHA_FILE_TEXT=true
SCROLITHA_FILE_PDF=true
SCROLITHA_FILE_DOCX=true
SCROLITHA_FILE_IMAGES=true
SCROLITHA_FILE_MULTI=true
SCROLITHA_FILE_SCANNED_PDF=false
SCROLITHA_ROLLOUT_MESSAGING_STREAM=true
SCROLITHA_ROLLOUT_TOOL_EXECUTION=true
SCROLITHA_ROLLOUT_CONFIRMATION_TOKENS=true
SCROLITHA_ROLLOUT_TOOL_WRITE_ACTIONS=true
```

## Builds

| Image | Status |
|---|---|
| scrolith-backend:p2079-3de89a3d | SUCCESS |
| scrolith-frontend:p2080-3f571533 | SUCCESS |

## Post-deploy traffic

| Service | Revision | Tag | Traffic |
|---|---|---|---|
| Backend | scrolith-backend-00138-zan | p2079 | 100% |
| Backend prior | scrolith-backend-00136-ziz | p2078 | 0% |
| Frontend | scrolith-frontend-00167-wal | p2080 | 100% |

## PRs

| PR | Merge |
|---|---|
| #103 BE | 3de89a3d |
| #104 FE | 3f571533 |

## Live capability statuses (public-profile)

| Capability | Status |
|---|---|
| file_understanding | available / Available |
| streaming | available / Available |
| read_tools | available / Available |
| write_actions | available_with_confirmation / Available with confirmation |

## Official assets live

- Profile: `.../edd2e7e7-...?v=p2079`
- Cover: `.../a163c581-...?v=p2079`
