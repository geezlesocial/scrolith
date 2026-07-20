# Scrolith Android 1.1.24 (34) — Phase 25

**Release name:** Phase 25 — Enterprise Android & Push  
**versionName:** 1.1.24  
**versionCode:** 34  
**applicationId:** com.scrolith.scrolith  
**minSdk:** 24 · **targetSdk:** 36 · **compileSdk:** 36  

## What's New

- Enterprise multi-channel push notifications (Messages, Community, Marketplace, Jobs, Gigs, Scroll, Stories, Posts, Follows, Mentions, Comments, Orders, Admin, Security, System)
- Scrolith monochrome notification icon + adaptive launcher monochrome layer
- Smarter notification deep links (messages, profile, Scroll, stories, marketplace, jobs, gigs, community, live, admin)
- Notification grouping via conversation/entity tags and collapse keys
- Native shell upgrades: AndroidX SplashScreen, predictive back, status/nav bars, offline probe, external link handling
- Play Integrity client library prepared for Phase 25A attestation
- R8 minify + resource shrink release AAB

## Play Console

- Upload the signed AAB from release artifacts (do not deploy from this phase automatically).
- Release track: Production (Phase 25A)
- Target SDK compliance: API 36
- App signing: Play App Signing + upload keystore `scrolith-release.jks`

## Deployment

Phase 25 builds and certifies the AAB only. Google Play production rollout is **Phase 25A**.
