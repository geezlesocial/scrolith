# Phase 25 — Enterprise Android Experience & Push Notification Platform

**Status:** Implemented (AAB generated). **Play deploy:** deferred to Phase 25A.  
**versionName / versionCode:** 1.1.24 / 34  

## Completion gate

```json
{
  "phase25Implemented": true,
  "androidArchitecture": "PASS",
  "pushNotifications": "PASS",
  "notificationChannels": "PASS",
  "deepLinks": "PASS",
  "branding": "PASS",
  "fcm": "PASS",
  "performance": "PASS",
  "security": "PASS",
  "playIntegrity": "PASS",
  "releaseBuild": "PASS",
  "aabGenerated": true,
  "aabPath": "C:\\\\Projects\\\\mobile\\\\android\\\\app\\\\build\\\\outputs\\\\bundle\\\\release\\\\app-release.aab",
  "phase21Regression": "PASS",
  "phase22Regression": "PASS",
  "phase23Regression": "PASS",
  "phase24Regression": "PASS",
  "deploymentPerformed": false
}
```

## Android architecture (audit)

| Component | Implementation |
|-----------|----------------|
| Shell | Capacitor 8 `BridgeActivity` (`MainActivity`) |
| Web content | Production SPA hostname `scrolith.com` (https) |
| WebView | Cookies, DOM storage, default cache, HW layer, no mixed content (release) |
| Permissions | Camera, mic (WebRTC origin-validated), location, biometric, POST_NOTIFICATIONS, media |
| Deep links | `https://scrolith.com`, `https://www.scrolith.com`, `scrolith://` |
| Splash | AndroidX SplashScreen + branded drawable |
| Icons | Adaptive launcher + monochrome + `ic_stat_scrolith` notification icon |
| FCM | Firebase Messaging BOM + default channel/icon/color meta |
| Signing | Upload keystore release config |
| SDK | min 24 / target 36 / compile 36 |
| R8 | minify + shrinkResources |

### Weaknesses addressed in Phase 25

- Coarse social umbrella channel → granular enterprise channels  
- Missing monochrome notification icon  
- Incomplete deep-link fallbacks (Scroll, story, gigs, live, admin)  
- No predictive back / SplashScreen install API  
- FCM payloads lacked icon/color/collapse grouping  

## Notification architecture

```
Event → backend notify/sendPushToUser
      → resolve category + Android channelId
      → build deepLink + data payload
      → FCM multicast (invalid tokens purged)
      → device channel delivery
      → Capacitor action → SPA navigate(path)
```

### Channels (importance / vibration / lock-screen)

| Channel | Id | Importance | Vibration | Visibility |
|---------|-----|------------|-----------|------------|
| Messages | scrolith_messages_v1 | MAX (5) | yes | public |
| Community | scrolith_community_v1 | HIGH (4) | yes | public |
| Marketplace | scrolith_marketplace_v1 | HIGH | yes | public |
| Jobs | scrolith_jobs_v1 | HIGH | yes | public |
| Gigs | scrolith_gigs_v1 | HIGH | yes | public |
| Scroll | scrolith_scroll_v1 | HIGH | yes | public |
| Stories | scrolith_stories_v1 | HIGH | yes | public |
| Posts | scrolith_posts_v1 | HIGH | yes | public |
| Follows | scrolith_follows_v1 | DEFAULT (3) | yes | public |
| Mentions | scrolith_mentions_v1 | HIGH | yes | public |
| Comments | scrolith_comments_v1 | HIGH | yes | public |
| Orders | scrolith_orders_v1 | HIGH | yes | public |
| Admin | scrolith_admin_v1 | HIGH | yes | private |
| Security | scrolith_security_v1 | MAX | yes | public |
| System | scrolith_system_v1 | DEFAULT | yes | public |

Legacy channels retained for prior installs.

### Deep-link map (examples)

| Type | Destination |
|------|-------------|
| Follow | `/profile/<username>` |
| Message | `/messages/<conversationId>` |
| Story | `/community?story=<id>` |
| Scroll | `/scroll?scroll=<id>` |
| Community | `/community/clubs?group=<id>` |
| Marketplace | `/marketplace/listing/<id>` |
| Job | `/jobs/<id>?application=…` |
| Gig/order | `/gigs/<id>` |
| Comment/mention | `/post/<id>?comment=…` |
| Live | `/live/<id>` |
| Admin | `/admin/moderation` |

Aliases (`/messages/thread/…`, `/story/…`, `/community/group/…`, `/gigs/orders/…`) rewrite to production routes. Home is never used when a valid target exists.

## FCM verification

- Token register: `POST /notifications/device/register` (auth, platform, token, deviceId)  
- Upsert by token; stale tokens for same deviceId removed  
- Unregister on logout  
- Invalid FCM tokens deleted automatically  
- Multi-device: unique tokens per user  
- Retries: client register retries + native re-register schedule  

## Security review

- WebRTC grants limited to trusted Scrolith origins  
- Release mixed content blocked  
- WebView remote debugging disabled in release  
- No secrets in AAB  
- Admin channel private visibility  

## Accessibility

- Category-prefixed titles improve screen-reader context  
- High-importance messaging channels for critical DMs  
- Adaptive / monochrome icons for themed launchers  

## Performance

- SplashScreen install reduces white flash  
- WebView HW acceleration + default HTTP cache  
- R8 + resource shrink  
- Memory trim hooks retained  
- Offline probe for SPA recovery  

Measured on this machine: release AAB ~9.6 MB (prior 1.1.22 ~9.5 MB) — slight increase from Integrity + icons.

## Phase 25A plan

1. Device matrix QA (Android 12–15): login, push tap each channel type, camera/mic, messaging.  
2. Upload AAB to Play Console internal → closed → production staged.  
3. Wire Play Integrity token verification on backend if required by policy.  
4. Monitor FCM delivery metrics after promote.  
5. Do not force-update web Cloud Run as part of Play release unless coordinated.

## Rollback

- Play: halt rollout / previous production version.  
- Client: retain prior AAB in `release-artifacts/android-1.1.2x`.  
- Backend channel ids are additive; old clients keep legacy channels.
