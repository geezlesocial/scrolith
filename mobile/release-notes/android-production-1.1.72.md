# Scrolith Android 1.1.72

## Release highlights

- Improved message composition across the inbox, floating Messaging panel, and conversations opened from the header.
- Added a shared 4,000-character message limit with predictable behavior on compact mobile layouts and desktop chat.
- Improved long-message wrapping and editing behavior so messages remain readable without breaking the conversation layout.
- Hardened Scroll video playback with bounded attachment fallbacks and safer retry behavior for signed media URLs.
- Improved recovery after transient media-load failures without changing existing reactions, captions, comments, sharing, follow, or analytics behavior.
- Preserved existing call, messaging, authentication, trusted-device, and marketplace functionality.

## Stability and compatibility

- The release uses the existing Capacitor runtime and production API contracts.
- No database migration or backend configuration change is included.
- No credentials or private data are included in the application bundle.
- The Android artifact is intended for manual Google Play Console upload.
