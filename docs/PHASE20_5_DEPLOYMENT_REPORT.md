# Phase 20.5 — Deployment Report

## Web / backend

| Service | Action |
|---|---|
| Frontend Cloud Run | **No deploy required** for AAB (web already at p2041; new FE changes are in AAB bundle + optional future web deploy) |
| Backend | **No deploy** |

Optional: deploy FE from this branch if website should get media upload helpers before next web release.

## Desktop website

| Step | Status |
|---|---|
| Local installers built | YES |
| scrolith.com/download | LIVE |
| GCS upload of 1.1.19 binaries | Operator: `npm run desktop:publish:gcs` with SA secret |

## Android Play

| Step | Status |
|---|---|
| Signed AAB produced | YES |
| Play Console upload | **Operator action** (see Play guide) |

## Rollback

| Layer | Path |
|---|---|
| Web FE | p203 `00138-ruh` or p2041 previous |
| Broken p204 | Remain 0% |
| Android | Do not ship; retain prior AAB 1.1.18 or store version |
| Desktop | Keep previous Setup 1.1.14 binaries |
