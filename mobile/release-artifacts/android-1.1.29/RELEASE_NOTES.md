# Scrolith Android 1.1.29 (39)

**Release name:** Stories, media reliability & messaging polish  
**versionName:** 1.1.29  
**versionCode:** 39  
**applicationId:** com.scrolith.scrolith  
**AAB:** `Scrolith-1.1.29-39-release.aab`  
**minSdk:** 24 · **targetSdk:** 36 · **compileSdk:** 36  

Bundled web: geezle `b2b4c93c` (production build)  
Backend companion (already live): message-alert email policy `dc538195`

---

## Google Play Console — “What’s new” (en-US)

Copy into Play Console → Production → Release notes:

```
<en-US>
Scrolith 1.1.29
• Manage your Stories: edit, update, or delete from the 3-dot menu and My Posts
• Clearer Scroll controls: Mute/Unmute next to Create (no overlap with names)
• More reliable profile photos, messaging avatars, and Google/LinkedIn sign-in logos
• Smarter message emails: only when you’re offline, at most once a day (push & in-app still real-time)
• Notification sound & channel improvements, reaction labels, and loading stability
• Multi-currency money display across marketplace, jobs, gigs, and ads
</en-US>
```

### Short plain-text (≤500 characters)

```
Scrolith 1.1.29: manage Stories (edit/update/delete), cleaner Scroll Mute/Unmute, more reliable photos & social login logos, messaging avatars that load correctly, message emails only when offline (once a day), better push sound/channels, reaction labels, multi-currency display, and stability fixes for Home, Scroll, and Community.
```

---

## Full change summary (internal / support)

### Stories
- Story owners can **edit, update, and delete** stories from the viewer **3-dot menu**
- Story management also available from **My Posts**

### Scroll
- **Mute / Unmute** control placed next to **Create** so it never overlaps the author name
- **Scroll** brand label positioned under **Follow** for clearer hierarchy

### Photos, avatars & social auth
- More reliable **profile photos** (retry + less false “default” placeholders)
- **Messaging** chat bar and conversation avatars use the correct profile photo IDs
- **Google** and **LinkedIn** logos always show on guest home, login, and login popups (durable assets)

### Messaging & notifications
- **Email message alerts** only when the user is **not online**, and **at most once per rolling day** (no email per message)
- Push and in-app notifications still deliver in real time for eligible messages
- Message **reaction** labels and realtime merge hardened
- Phase 29-class **push channels (v2)** and **Scrolith** notification sound retained

### Money & platform
- Multi-currency surfaces for ads, jobs, gigs, and marketplace (preferred currency / money display)
- Loading stability for **Member Home**, **Scroll**, and **Community**

### Security / quality
- Signed release AAB with R8 minify + resource shrink
- Production WebView origin: `https://scrolith.com`
- No cleartext traffic in release

---

## Play Console checklist

| Item | Value |
|------|--------|
| Upload artifact | `mobile/release-artifacts/android-1.1.29/Scrolith-1.1.29-39-release.aab` |
| Version code | **39** (must be greater than 38) |
| Version name | **1.1.29** |
| Track | Production (manual upload) |
| App signing | Play App Signing + upload keystore |
| Mapping (optional) | `mapping.txt` in the same folder (deobfuscation) |
| Integrity | SHA-256 in `SHA256SUMS.txt` / `artifact-metadata.json` |

**Do not** publish automatically from CI — this package is for **manual** Google Play upload.

---

## Rollback

- Previous store package: Android **1.1.28 (38)** if Play still has it staged  
- Or halt rollout and re-upload last certified AAB from `release-artifacts/android-1.1.28/`
