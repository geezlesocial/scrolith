# Scrolith Android 1.1.73

## Release highlights

- Added mobile-friendly More/Less controls for messages longer than 500 characters.
- Preserved complete message content across inbox, header chat, and the floating Messaging widget.
- Improved long-message wrapping and readability on compact screens.
- Added a clear More/Less control for messages longer than 500 characters,
  with the complete message body preserved for both participants.
- Improved realtime socket startup and recovery so messaging and incoming-call
  events survive transient WebSocket handshake failures.
- Hardened Scroll video playback recovery for transient signed-media failures.
- Preserved existing calls, messaging, authentication, trusted devices, marketplace, captions, reactions, and sharing.

## Stability and compatibility

- Play release rebuild with version code 83.
- No database migration or backend configuration change.
- The AAB is intended for manual Google Play Console upload.
