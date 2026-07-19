# Phase 21.1.2R — Deployment

## Frontend

Image tag: p2112r-<commit>
Must ship nginx Permissions-Policy fix (microphone=(self)).

Rollback: prior p2112 revision `scrolith-frontend-00127-p5c` or p2111 `00179-zav`.

## Android

Build AAB 1.1.23 (33) after FE ships. FE-only does not fully certify WebView bridge — install AAB required for native grant path.
