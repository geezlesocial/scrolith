# Phase 20.5.1 — Device Lab Report

**Date:** 2026-07-18  
**Build under test:** Android `com.scrolith.scrolith` **1.1.19 (29)**  
**AAB SHA-256:** `277a27bdd05a0514f03911aabeed3093bff50f345edc52b4ea7bb760afb9d8ac`

## Lab availability

| Resource | Result | Status |
|---|---|---|
| `adb devices` | Empty device list (daemon started; **no devices attached**) | **blocked** |
| Physical Android devices | Not available to automation host | **blocked** |
| Emulator | **Not used as substitute** for required physical coverage | **not applicable** |
| Play store upgrade path from 1.1.14 | Requires Play / device | **pending operator approval** |

**Distinction:** All rows below marked *pending* are **physical-device** requirements. No emulator results are claimed as physical.

---

## Required coverage matrix

| Requirement | Device model | Android version | Install type | Result | Status |
|---|---|---|---|---|---|
| Near min-supported OS (~API 24+) | — | — | — | Not run | **blocked** |
| Modern Android device | — | — | — | Not run | **blocked** |
| Upgrade from Play 1.1.14 | — | — | upgrade | Not run | **blocked** |
| Clean install of 1.1.19 | — | — | clean | Not run | **blocked** |
| Low-memory / budget class | — | — | — | Not run | **blocked** |
| Tablet (where available) | — | — | — | Not run | **blocked** |

---

## Functional test checklist (physical)

Record **Pass / Fail / Blocked / N/A** per device when lab is available.

| Test | Clean install | Upgrade 1.1.14→1.1.19 | Notes |
|---|---|---|---|
| Launch | pending | pending | |
| Login | pending | pending | |
| Session persistence | pending | pending | |
| Logout and login | pending | pending | |
| Freelancer dashboard | pending | pending | |
| Employer dashboard | pending | pending | |
| Role switching | pending | pending | |
| Growth Pulse | pending | pending | |
| Focus panel | pending | pending | |
| Status strip | pending | pending | |
| Search | pending | pending | |
| Feed | pending | pending | |
| Messaging | pending | pending | |
| Notifications | pending | pending | |
| Notification deep links | pending | pending | |
| Camera permission | pending | pending | |
| Camera capture | pending | pending | |
| Gallery picker | pending | pending | |
| Image upload | pending | pending | |
| Video capture | pending | pending | |
| Video upload | pending | pending | |
| File upload | pending | pending | |
| File download | pending | pending | |
| Background / foreground | pending | pending | |
| Process kill and relaunch | pending | pending | |
| Offline mode | pending | pending | |
| Network reconnection | pending | pending | |
| Permission denial and recovery | pending | pending | |
| Keyboard behavior | pending | pending | |
| Screen rotation | pending | pending | |
| Accessibility font scaling | pending | pending | |
| Screen reader basics | pending | pending | |
| Back-button behavior | pending | pending | |
| External links | pending | pending | |
| No ErrorBoundary during normal dashboard use | pending | pending | |
| No native fatal crash | pending | pending | |

---

## Pre-lab software confidence (not a substitute for physical)

| Item | Source | Status |
|---|---|---|
| Phase 20.4.1 dashboard TDZ fix in bundled web | Prior certification + AAB web bundle | **completed** (software) |
| Media capture / gallery code paths | Phase 20.5 implementation | **completed** (software) |
| Production API/Web baseline healthy | Cloud Run p2041 / backend 00114-bay | **completed** |
| Device install validation | Physical lab | **blocked** |

---

## Gates

| Gate | Result |
|---|---|
| PHYSICAL CLEAN INSTALL PASSED | **NO** |
| PHYSICAL UPGRADE INSTALL PASSED | **NO** |
| FREELANCER DASHBOARD PASSED | **NO** (physical) |
| EMPLOYER DASHBOARD PASSED | **NO** (physical) |
| ROLE SWITCHING PASSED | **NO** (physical) |
| CAMERA AND IMAGE WORKFLOWS PASSED | **NO** (physical) |
| VIDEO WORKFLOW PASSED | **NO** (physical) |
| MESSAGING PASSED | **NO** (physical) |
| NOTIFICATIONS PASSED | **NO** (physical) |
| DEEP LINKS PASSED | **NO** (physical) |
| OFFLINE RECOVERY PASSED | **NO** (physical) |

## Operator instruction

Attach at least one physical device via USB debugging (or sideload internal track build after Play processing) and complete the matrix before declaring **PUBLIC RELEASE COMPLETE**. Staged Play rollout may proceed only after operator accepts residual risk **or** physical gates pass.
