# Phase 27 — Android Rebuild, Push Certification & Play Bundle

**Date:** 2026-07-20  
**Result:** Implementation + signed AAB **PASS** · `deploymentPerformed: false` (no Play upload)

---

## 1. Release readiness

```json
{
  "productionFrontendRevision": "scrolith-frontend-00227-xud",
  "productionBackendRevision": "scrolith-backend-00164-vax",
  "androidFrontendCommit": "c4aacad1a4af1c822da2ab220ba78aea37f30685",
  "androidReleaseEligible": true,
  "pendingReleaseDependency": null
}
```

| Check | Result |
|-------|--------|
| Phase 26C + logo hotfix live | FE `00227-xud` (p26c-logo) |
| Backend multilingual + push | `00164-vax` (Phase 26A) |
| Monitoring dependency | None blocking packaging |

---

## 2. Architecture audit (summary)

```
Launcher → MainActivity (BridgeActivity)
  → Capacitor WebView (hostname scrolith.com / https)
  → SPA auth + routes
  → App links (https://scrolith.com + custom scheme)
  → Firebase Messaging (google-services.json)
  → FE push.ts token register / channels / deep links
  → BE pushNotifications + notificationAndroidChannels + notificationActionUrl
```

| Component | Path |
|-----------|------|
| MainActivity | `mobile/android/app/src/main/java/.../MainActivity.java` |
| Manifest | `mobile/android/app/src/main/AndroidManifest.xml` |
| Gradle | `mobile/android/app/build.gradle` (1.1.25 / 35) |
| Capacitor | `mobile/capacitor.config.ts` |
| Push client | `geezle/src/mobile/push.ts` |
| Taxonomy FE | `geezle/src/utils/notificationTaxonomy.ts` |
| Taxonomy BE | `geezle-backend/src/services/notificationAndroidChannels.ts` |
| FCM send | `geezle-backend/src/services/pushNotifications.ts` |
| Action URLs | `geezle-backend/src/services/notificationActionUrl.service.ts` |
| Small icon | `res/drawable/ic_stat_scrolith.xml` |
| Adaptive icons | `mipmap-anydpi-v26/ic_launcher*.xml` + monochrome |

**Weaknesses addressed in 27:** version increment, FE sync to latest certified web, channel definitions single-source (private message lock-screen), Phase 27 type aliases, NDK symbol level config, source tests.

**Residual:** Physical Android 12–15 matrix + live FCM end-to-end on devices → **Phase 27A**. Native debug symbols zip not generated (no app NDK code; prebuilt SO only).

---

## 3. Frontend synchronization

| Step | Result |
|------|--------|
| `npm run android:sync` | **SUCCESS** |
| Production origin | `hostname: scrolith.com`, `androidScheme: https`, `allowMixedContent: false` |
| No localhost server | **PASS** |
| Follow-onboarding | sticky CTA + logo `78b68af8…` in assets |
| Language prefs chunk | present |
| OAuth exchange SPA | present in dist |
| Push channel ids | in main bundle |

---

## 4. Notification taxonomy & channels

Stable channel IDs (unchanged from Phase 25; definitions centralized):

Messages · Community · Marketplace · Jobs · Gigs · Scroll · Stories · Posts · Follows · Mentions · Comments · Orders · Admin · Security · System (+ Scrolitha, legacy social/alerts)

| Change | Detail |
|--------|--------|
| Messages visibility | **Private** lock screen (0) |
| Security importance | **MAX (5)** |
| Aliases | `chat`, `group_invite`, `community_request`, `marketplace_inquiry`, `payment` |
| Source labels | `formatNotificationSourceLabel` |

Deep links preserve exact destinations (`/messages/:id`, `/scroll?scroll=`, `/community?story=`, `/post/:id`, jobs/gigs/marketplace/community clubs) — no invented Home fallback.

---

## 5. Icons

| Asset | Status |
|-------|--------|
| Adaptive launcher + round | PASS (existing Phase 25 assets) |
| Monochrome | PASS (`ic_launcher_monochrome`) |
| Notification small icon | PASS (`ic_stat_scrolith` white vector; Manifest default) |
| FCM default color | brand primary |

---

## 6. FCM token lifecycle (code evidence)

`push.ts`: auth-gated register, device id, token storage project binding, refresh/retry, backend register, logout clear — **preserved Phase 25**. Live multi-device lab → 27A.

---

## 7. Versioning & signing

| Field | Value |
|-------|--------|
| versionName | **1.1.25** |
| versionCode | **35** (> 34) |
| Keystore | `key.properties` present (secrets not logged) |
| `bundleRelease` | **BUILD SUCCESSFUL** (~6m) |
| jarsigner | certificate present (expires 2053-07-31) |

---

## 8. AAB paths (upload these)

```
C:\Projects\mobile\android\app\build\outputs\bundle\release\app-release.aab
C:\Projects\mobile\release-artifacts\android-1.1.25\Scrolith-1.1.25-35-release.aab
```

| Metric | Value |
|--------|--------|
| Size | **10,065,045** bytes |
| SHA-256 | **27920e1fbc78c1e282c308c9f5d30cdbe77daa74d988b642a79e1483808531f0** |
| Native symbols | **NOT_AVAILABLE** (config set; no app NDK symbols archive) |

---

## 9. Tests

| Suite | Result |
|-------|--------|
| `tests/unit/phase27AndroidPushTaxonomy.test.ts` | **PASS** |
| `tests/unit/phase2026MessagingNotifications.test.ts` | **PASS** |
| Combined | **17/17 PASS** |

---

## 10. Regressions (structural)

| Phase | Status |
|-------|--------|
| 21 feed | No feed code rewrite; SPA assets only |
| 22 / 22.3C messaging privacy | Message channel private lock screen; preview policy BE unchanged |
| 23 Scroll | Deep link `/scroll?scroll=` preserved |
| 24 Community | Routes + community channel preserved |
| 25 / 25C | Push taxonomy + OAuth SPA synced |
| 26 / 26C | Multilingual + onboarding UI in assets |

---

## 11. Phase 27A plan

1. Upload AAB to Play Console (internal testing track first).  
2. Attach mapping.txt if needed for deobfuscation.  
3. Device matrix Android 12–15: push categories, deep links cold/warm/killed, OAuth, onboarding.  
4. Staged rollout 10% → 50% → 100% after clean metrics.  
5. Do **not** mark production rollout complete without device cert.

---

## Completion gate

See `geezle/playwright-results/phase27/completion-gate.json`.
