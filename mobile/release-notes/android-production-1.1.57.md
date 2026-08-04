# Scrolith Android Production 1.1.57

Version code: 67

## Google Play Release Note

```text
<en-US>
This release improves media reliability and mobile playback across Scrolith. It hardens post, story, scroll, and community feed media loading, prevents missing legacy media from appearing as broken cards, and keeps the Android app aligned with the latest production Azure backend and frontend delivery fixes.
</en-US>
```

## Included

- Hardened media delivery for posts, stories, scroll videos, and community/member-home feeds.
- Safer handling for legacy uploaded media that is no longer available in storage.
- Production API alignment with `https://api.scrolith.com`.
- Android production bundle refresh using versionCode 67 for Google Play.

## Compatibility

- Supports Android API 24+.
- Uses the production Scrolith origin and HTTPS-only release configuration.
- No database migration is required.
