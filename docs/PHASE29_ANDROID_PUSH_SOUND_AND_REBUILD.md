# Phase 29 — Scrolith Android Rebuild, Push Notification Sound & Alert Hardening

**Date:** 2026-07-21  
**Result:** Implementation + signed AAB **PASS** · `deploymentPerformed: false` (no Play upload)  
**Next:** Phase 29A — Google Play Upload, Android Device Certification & Staged Rollout

---

## 1. Brand & sound

| Item | Value |
|------|--------|
| Platform brand | **Scrolith** (unchanged package, domain, company) |
| Notification sound resource | `scrolith` (file: `res/raw/scrolith.wav`) |
| Internal name | **Scrolith notification sound** |
| Pronunciation guidance only | **“Scroll it”** |
| Duration (WAV parse) | ~0.88 s @ 24 kHz mono 16-bit (~84 KB) |
| Extension in channel config | **Never** — use `sound: "scrolith"` only |

Do not rename the application package, company name, domain, or user-visible platform brand to “Scroll it.”

---

## 2. Architecture audit

```
Backend event → pushNotifications.buildPushMessage / buildAndroidPushConfig
  → FCM (Firebase project scrolith-platform, named app scrolith-push)
  → Android device → Notification channel (v2) → sound raw/scrolith
  → small icon ic_stat_scrolith → system tray
  → tap → Capacitor PushNotifications actionPerformed
  → push.ts normalize deep link → SPA route
```

| Component | Path |
|-----------|------|
| MainActivity | `mobile/android/app/src/main/java/.../MainActivity.java` |
| Manifest | `mobile/android/app/src/main/AndroidManifest.xml` |
| Gradle | `mobile/android/app/build.gradle` (**1.1.26 / 36**) |
| Capacitor | `mobile/capacitor.config.ts` (`hostname: scrolith.com`, `https`) |
| Sound | `mobile/android/app/src/main/res/raw/scrolith.wav` |
| Small icon | `mobile/android/app/src/main/res/drawable/ic_stat_scrolith.xml` |
| Push client | `geezle/src/mobile/push.ts` |
| Taxonomy FE | `geezle/src/utils/notificationTaxonomy.ts` |
| Taxonomy BE | `geezle-backend/src/services/notificationAndroidChannels.ts` |
| FCM send | `geezle-backend/src/services/pushNotifications.ts` |
| Privacy | `geezle-backend/src/services/messageNotifications.ts` (Phase 22.3C) |

### Defects addressed in Phase 29

| Defect | Fix |
|--------|-----|
| Channel sound is immutable after create; legacy short-id channels on device used system default sound | Migrate enterprise delivery to `*_v2` with custom `scrolith` sound; retain v1 for legacy payloads |
| Need wallet / payments taxonomy | New categories + `scrolith_wallet_v2` / `scrolith_payments_v2` |
| Arbitrary client channelId risk | Allowlist + `sanitizeAndroidChannelId` on backend |
| Version for Play (35 / 1.1.25 already shipped) | Bump to **36 / 1.1.26** |

---

## 3. Channel migration matrix

Android does **not** update channel sound after first creation. Phase 29 creates versioned IDs and routes new FCM traffic to them. Old channels are **not** deleted.

| Existing channel | New channel | Sound | Migration required |
|------------------|-------------|-------|--------------------|
| `scrolith_messages_v1` | `scrolith_messages_v2` | `scrolith` | **Yes** |
| `scrolith_community_v1` | `scrolith_community_v2` | `scrolith` | **Yes** |
| `scrolith_marketplace_v1` | `scrolith_marketplace_v2` | `scrolith` | **Yes** |
| `scrolith_jobs_v1` | `scrolith_jobs_v2` | `scrolith` | **Yes** |
| `scrolith_gigs_v1` | `scrolith_gigs_v2` | `scrolith` | **Yes** |
| `scrolith_scroll_v1` | `scrolith_scroll_v2` | `scrolith` | **Yes** |
| `scrolith_stories_v1` | `scrolith_stories_v2` | `scrolith` | **Yes** |
| `scrolith_posts_v1` | `scrolith_posts_v2` | `scrolith` | **Yes** |
| `scrolith_follows_v1` | `scrolith_follows_v2` | `scrolith` | **Yes** |
| `scrolith_mentions_v1` | `scrolith_mentions_v2` | `scrolith` | **Yes** |
| `scrolith_comments_v1` | `scrolith_comments_v2` | `scrolith` | **Yes** |
| `scrolith_orders_v1` | `scrolith_orders_v2` | `scrolith` | **Yes** |
| `scrolith_admin_v1` | `scrolith_admin_v2` | `scrolith` | **Yes** |
| `scrolith_security_v1` | `scrolith_security_v2` | `scrolith` | **Yes** |
| `scrolith_system_v1` | `scrolith_system_v2` | `scrolith` | **Yes** |
| `scrolith_scrolitha_v1` | `scrolith_scrolitha_v2` | `scrolith` | **Yes** |
| `scrolith_social_v1` | `scrolith_social_v2` | `scrolith` | **Yes** |
| *(new)* | `scrolith_wallet_v2` | `scrolith` | **New** |
| *(new)* | `scrolith_payments_v2` | `scrolith` | **New** |
| `scrolith_alerts_v2` | `scrolith_alerts_v2` | `scrolith` | **Not required** (already v2 default FCM channel) |
| `messages` / `general` / `posts` (short legacy) | retained | n/a | Legacy only — new FCM does not target short ids |
| `campaigns_scrolith_v1` | retained | `scrolith` (device dump) | Legacy only |

**Policy:** Do not create new channel IDs on every release. Only on sound or importance migration. Existing users may need to review Android notification settings if they previously muted a channel; user mute preferences on old channels are preserved (old channels not deleted).

---

## 4. Category → channel map (active)

| Category | Channel ID | Sound policy |
|----------|------------|--------------|
| message / chat / group_chat | `scrolith_messages_v2` | high |
| community / group_invite | `scrolith_community_v2` | standard |
| marketplace / marketplace_inquiry | `scrolith_marketplace_v2` | standard |
| job / job_application* | `scrolith_jobs_v2` | high |
| gig / freelancing | `scrolith_gigs_v2` | high |
| scroll / live | `scrolith_scroll_v2` | standard |
| story | `scrolith_stories_v2` | standard |
| post / reaction / social | `scrolith_posts_v2` | standard |
| follow | `scrolith_follows_v2` | standard |
| mention | `scrolith_mentions_v2` | standard |
| comment / reply | `scrolith_comments_v2` | standard |
| order | `scrolith_orders_v2` | high |
| wallet / payout | `scrolith_wallet_v2` | high |
| payment / refund | `scrolith_payments_v2` | high |
| admin | `scrolith_admin_v2` | high |
| security | `scrolith_security_v2` | high |
| system | `scrolith_system_v2` | standard |
| app_campaign | `scrolith_alerts_v2` | high |
| scrolitha | `scrolith_scrolitha_v2` | standard |

Silent (no user notification UI): token refresh, analytics, background sync — not sent as FCM user alerts.

---

## 5. Backend FCM payload contract (actual fields)

```json
{
  "type": "<event-type>",
  "category": "<resolved-category>",
  "categoryLabel": "<label>",
  "channelId": "scrolith_messages_v2",
  "deepLink": "Scrolith://messages/<id>",
  "link": "/messages/<id>",
  "notificationId": "<id>",
  "entityId": "<optional>",
  "sound": "scrolith",
  "icon": "ic_stat_scrolith"
}
```

- `android.notification.channelId` / `sound` / `icon` set in `buildAndroidPushConfig`
- Deep link built server-side via `notificationActionUrl` + taxonomy
- No auth tokens or secrets in payload
- Message previews respect `canIncludeMessagePreview` (Phase 22.3C)
- Message / wallet / payment / admin / security → Android visibility `private`

---

## 6. Icons

| Asset | Status |
|-------|--------|
| Small notification | `ic_stat_scrolith` monochrome white vector |
| Manifest default icon | `@drawable/ic_stat_scrolith` |
| Default channel | `scrolith_alerts_v2` |
| Launcher adaptive | existing `ic_launcher` / monochrome |

---

## 7. Production URLs

| Check | Result |
|-------|--------|
| Capacitor hostname | `scrolith.com` |
| androidScheme | `https` |
| API | `https://api.scrolith.com` (app runtime) |
| Cleartext production | **disabled** (base-config + scrolith domain-config) |
| No localhost in release Capacitor server | **PASS** |

---

## 8. Versioning & signing

| Field | Value |
|-------|--------|
| versionName | **1.1.26** |
| versionCode | **36** (> 35) |
| applicationId | `com.scrolith.scrolith` |
| Keystore | `mobile/android/scrolith-release.jks` via `key.properties` |
| jarsigner | **jar verified** |
| Upload cert | Compatible with prior Play App Signing chain (same keystore as 1.1.25) |

---

## 9. AAB artifacts

```
C:\Projects\mobile\android\app\build\outputs\bundle\release\app-release.aab
C:\Projects\mobile\release-artifacts\android-1.1.26\Scrolith-1.1.26-36-release.aab
```

| Metric | Value |
|--------|--------|
| Size | **10,086,990** bytes |
| SHA-256 | **19c2ab335dc684e3ca34f37c546d41b9b113a4ae66082fae0314c06e925d7a90** |
| mapping.txt | `...\android-1.1.26\mapping.txt` (also build outputs) |
| native-debug-symbols.zip | **NOT_AVAILABLE** (no app NDK sources; strip config set; prebuilt SO only) |

**Do not upload in Phase 29.** Upload is Phase 29A.

---

## 10. Tests

| Suite | Result |
|-------|--------|
| `tests/unit/phase29AndroidPushSound.test.ts` | **PASS** (10) |
| `tests/unit/phase27AndroidPushTaxonomy.test.ts` | **PASS** (7) |
| `src/utils/__tests__/phase25AndroidPush.spec.ts` (vitest) | **PASS** (6) |
| Combined node:test 27+29 | **17/17 PASS** |

---

## 11. Device / live push certification

| Area | Status |
|------|--------|
| Static code + resource + unit | **PASS** |
| Physical Android 12–15 sound | **NOT_TESTED** (Phase 29A) |
| Foreground / background / terminated E2E | **NOT_TESTED** on device (Phase 29A) |
| Fresh install + upgrade from 35 | **NOT_TESTED** (Phase 29A) |

Code evidence supports correct channel, sound resource, icon, deep links, privacy, and FCM payload. Device sound acceptance criteria remain for 29A.

---

## 12. Google Play release notes (&lt; 500 chars)

```
<en-US>
Scrolith 1.1.26 improves Android push reliability with the Scrolith alert sound (Scroll it), upgraded notification channels, clearer categories (Messages, Scroll, Stories, Posts, Communities, Jobs, Gigs, Marketplace, Wallet, Payments), accurate deep links, private message previews, stronger security, and stability fixes.
</en-US>
```

Character count: ~312.

---

## 13. Phase 29A plan (do not execute here)

1. Upload AAB `Scrolith-1.1.26-36-release.aab` to Play Console (internal → closed → staged production).
2. Attach mapping.txt for deobfuscation.
3. Device certification matrix Android 12–15 (Pixel + Samsung if available).
4. Verify custom sound on fresh install and upgrade from 1.1.25.
5. Confirm FCM end-to-end after backend channel v2 deploy.
6. Staged rollout 5% → 20% → 50% → 100% with crash/ANR gates.

---

## 14. Rollback

- Play: halt rollout / rollback to prior production track (versionCode 35).
- Backend: channel IDs are additive; reverting BE to v1 still delivers to retained legacy channels.
- Do not delete v2 channels after partial rollout without a retirement plan.

---

## 15. Completion gate

See `geezle/playwright-results/phase29/completion-gate.json`.
