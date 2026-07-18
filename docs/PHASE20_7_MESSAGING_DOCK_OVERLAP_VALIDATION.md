# Phase 20.7 Dock Overlap — Validation

## Automated / production evidence

| Check | Result |
|---|---|
| Policy unit tests | **Pass** |
| FE build | **Pass** |
| Deploy 00149-siz 100% | **Pass** |
| /messages HTTP 200 | **Pass** |
| / HTTP 200 | **Pass** |
| Policy in production JS | **Pass** (`hasShouldShowDock=True`) |

## Authenticated operator checklist (visual)

| Check | Status |
|---|---|
| Login → /messages → no floating dock | **Pending operator hard-refresh** |
| Open conversation → no dock | **Pending operator** |
| Navigate home → dock available (desktop ≥1024px) | **Pending operator** |
| Scrolitha still pinned in inbox | **Pending operator** |
| Human DM send | **Pending operator** |
| Media preview (20.6) | **Pending operator** |
| Android/Desktop wrappers | Inherit web; **pending operator** |

Hard-refresh required after deploy so browsers drop cached p207 shell.
