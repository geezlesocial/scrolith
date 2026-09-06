# Scrolith Android Native Shell

The Android app remains a Capacitor WebView application. The native shell adds
controlled lifecycle, recovery, device capability, and navigation boundaries
without replacing the web application or its authentication/session model.

## Native bridge

The app-owned bridge is exposed as `window.ScrolithNative` only by the Android
shell. The bridge is versioned (`2`) and all methods reject calls unless the
current top-level page is a trusted Scrolith origin.

| Method | Result | Purpose |
| --- | --- | --- |
| `getBridgeVersion()` | string | Returns the bridge contract version (`2`). |
| `getAppVersion()` | string | Returns the installed Android app version. |
| `getConnectionState()` | `online`, `offline`, or `unknown` | Reads the Android connectivity state. |
| `getCapabilities()` | JSON string | Reports bridge version, enabled debug pilots, and native event names. |
| `showToast(message)` | void | Displays a short, bounded native toast. |
| `triggerHaptic(style)` | void | Provides a short haptic pulse. Use `strong` for a slightly longer pulse. |
| `openNativeFilePicker(accept, allowMultiple)` | void | Opens Android's document picker. |
| `postEvent(name, payloadJson)` | void | Sends only documented commands: `navigate`, `set_theme`, and `set_keyboard_mode`. |

The file picker publishes a `scrolith:native-file-selected` browser event with
`detail: { cancelled, accept, multiple, uris }`. `uris` contains content URI
strings and may be empty when the user cancels. Existing HTML file inputs keep
using Capacitor's file chooser path.

## Existing events preserved

- `scrolith:native-network` reports connectivity changes.
- `scrolith:native-insets` reports system-bar and keyboard insets.
- `mobile:incoming-call` hands an incoming call from FCM to the web call
  provider.
- `mobile:push-notification-received` handles foreground push notifications.

The bridge does not expose tokens, cookies, database values, arbitrary URL
execution, or filesystem paths. Production releases keep cleartext traffic
disabled and only grant camera/microphone capture to trusted Scrolith origins.

## Phase 3 native experience pilot

The Phase 3 native Notifications Center is a hybrid presentation pilot. The
authenticated WebView remains the source of truth for notification HTTP calls,
Socket.IO updates, unread state, mark-read actions, and deep-link routing. The
native view receives only a bounded, sanitized snapshot and sends allowlisted
commands back to the WebView.

Release builds keep these pilots disabled. Debug builds can enable them for
internal testing with launch extras:

```text
adb shell am start -n com.scrolith.scrolith/.MainActivity \
  --ez scrolith_native_navigation true \
  --ez scrolith_native_notifications true
```

When `scrolith_native_notifications` is enabled, open `/m/notifications` to
exercise the native host. If the bridge, snapshot, action, or feature flag is
unavailable, the existing WebView Notifications screen remains the fallback.

The Phase 3 bridge adds the `nativeNotifications` and
`nativeNavigationPilot` capability fields, plus the `scrolith:native-command`
event. Supported notification commands are
`notifications.request_snapshot`, `notifications.retry`,
`notifications.mark_read`, `notifications.mark_all_read`, and
`notifications.open_action`. Payloads are bounded and internal action paths
are validated before navigation. No notification tokens, cookies, raw external
URLs, or arbitrary user lookup data are exposed to Android.

## Recovery behavior

Main-frame load failures show a native Retry state. Network recovery retries a
failed initial load when connectivity returns. A WebView renderer crash is
handled by recreating the activity once, preserving the existing Capacitor
startup path and session storage.

## Phase 2 pilot flags

The native navigation pilot and priority native-screen slot are disabled in
release builds. They can only be enabled in a debuggable build through launch
extras, which prevents an unvalidated native surface from changing production
behavior:

```text
adb shell am start -n com.scrolith.scrolith/.MainActivity \
  --ez scrolith_native_navigation true \
  --ez scrolith_native_priority_screens true
```

The pilot navigation routes to the existing authenticated WebView routes. The
Messages and Notifications screens remain the source of truth for socket state,
read status, attachments, calls, and deep links until physical-device parity
testing authorizes a native content implementation.
