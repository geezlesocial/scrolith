# Scrolith Android Phase 3 Technical Design

**Status:** Approved implementation baseline
**Scope:** Native bottom navigation pilot and first selective native screen
**Baseline:** Android `1.1.98` / version code `108`, Phase 1 shell and Bridge v2

## 1. Executive Decision

Phase 3 should ship one user-visible native screen first: a hybrid Native
Notifications Center. The existing WebView remains the source of truth for
authentication, notification API calls, socket synchronization, unread state,
mark-as-read operations, and deep-link routing. Android owns presentation,
back-stack behavior, accessibility, and offline/error framing only.

The native bottom navigation should be delivered as a separately gated shell
pilot. Its destinations continue to open the existing WebView routes, so it
does not create a second navigation or data model. Native Messages, especially
the conversation screen, is deferred because attachments, receipts, realtime
sync, and calls make it the highest-risk migration target.

Release builds keep both new experiences disabled until physical-device parity
testing and an explicit enablement decision are complete.

## 2. Current Audit Summary

### Android shell

- `MainActivity` extends Capacitor `BridgeActivity` and manages one production
  WebView through `activity_main.xml`.
- WebView cookies, DOM storage, media permissions, file selection, lifecycle,
  renderer recovery, offline state, system bars, and deep links are already
  handled in the activity.
- Production WebView debugging is disabled, cleartext traffic is disabled, and
  camera/microphone capture is restricted to trusted Scrolith origins.
- `ScrolithNativeBridge` is version `2`. It exposes bounded metadata, haptics,
  file picker access, and an allowlisted event command surface. It exposes no
  tokens, cookies, filesystem paths, or arbitrary URL execution.
- The current native navigation bar is a debug-only route pilot. It is a
  simple activity overlay and is not yet a production-quality native screen.
- `NativeFeatureFlags.arePriorityScreensEnabled()` is currently a capability
  report only; no priority screen is native in the current release.

### Web notification runtime

- `NotificationContext` owns the authenticated notification list, socket
  events, deduplication, unread state, polling fallback, offline recovery, and
  cross-device notification sync.
- `NotificationService` uses the existing authenticated endpoints, including
  `/notifications`, `/notifications/summary`, `/notifications/mark-read`, and
  `/notifications/actions`.
- `/api/notifications/user/:userId` is admin-only and must never be used by a
  native user screen.
- `MobileNotificationsScreen` and `NotificationCenter` already provide the
  WebView fallback and current product behavior.
- Socket events include `notifications:new` and related message/push events.
  The web provider already filters and normalizes these for the active user.

### Known documentation gap

`mobile/docs/ANDROID_NATIVE_SHELL.md` describes `getBridgeVersion()` as
returning `1`, while the implementation and contract test correctly use `2`.
Phase 3 documentation work must correct this without changing runtime
behavior.

## 3. Exact Phase 3 Scope

### Ship in the implementation phase

1. **Hybrid Native Notifications Center**
   - Native list, unread/read styling, category label, timestamp, empty state,
     loading state, offline state, and retry action.
   - Native row activation delegates internal action paths to the existing web
     router.
   - Mark-as-read delegates to the existing web notification service.
   - Refresh requests delegate to the existing web notification context.
   - Realtime snapshots and deltas are delivered from the web runtime to the
     native view without a second socket connection.

2. **Native bottom navigation pilot**
   - Home, Messages, Scroll, Match, and Profile destinations.
   - Uses familiar icons and accessible labels.
   - Navigation remains WebView-backed in this phase.
   - The current raw text overlay is replaced only when the pilot is enabled;
     the default WebView layout remains unchanged.

3. **Bridge v2 additive extensions**
   - Capability discovery for native notifications and navigation pilot.
   - A versioned notification state envelope and request/response correlation.
   - Allowlisted native notification commands and bounded payloads.
   - Native-to-web events for refresh, mark-read, and notification activation.

4. **Reliability and UX polish**
   - Back closes the native screen before navigating WebView history.
   - Bridge timeout or malformed payload immediately falls back to
     `/notifications`.
   - Memory-only native state is cleared on logout or authenticated-user
     change.
   - Haptics are used only for deliberate navigation or row activation where
     the existing bridge capability is available.

### Defer to a later phase

- Native Messages conversation view.
- Native call screens or a second WebRTC signaling client.
- Direct Android API clients or a second Socket.IO connection.
- Native Match, profile editing, settings, and marketplace workflows.
- App shortcuts and biometric changes, unless separately approved after the
  notification pilot is stable.

## 4. Native Notifications Data Flow

The data path must remain:

```text
Authenticated WebView
  -> NotificationContext / existing socket and HTTP services
  -> sanitized Bridge v2 notification envelope
  -> Native Notifications UI
  -> bridge command to WebView
  -> existing API/router/socket state
```

### Web-to-native state envelope

Only the following fields may cross the bridge:

```json
{
  "bridgeVersion": "2",
  "requestId": "uuid",
  "kind": "snapshot | delta | action_result",
  "sessionBinding": "opaque-runtime-session-value",
  "items": [
    {
      "id": "notification-id",
      "type": "message",
      "title": "New message",
      "message": "Preview text",
      "isRead": false,
      "category": "messaging",
      "priority": "normal",
      "createdAt": "2026-09-06T00:00:00.000Z",
      "actionPath": "/messages/conversation-id"
    }
  ],
  "unreadCount": 1,
  "hasMore": false,
  "serverTime": "2026-09-06T00:00:00.000Z"
}
```

The implementation must not forward arbitrary metadata, actor secrets,
tokens, cookies, raw external URLs, or data from an admin user's arbitrary
user lookup. `title` and `message` are bounded strings. `actionPath` must be an
internal HTTPS-owned path or be omitted; external actions continue through the
existing web notification routing rules.

The `sessionBinding` is an opaque runtime-session value used to correlate
events. It must not be reversible and must not be used as an authorization
mechanism. Authorization remains server-side through the existing
authenticated web runtime.

### Native-to-web commands

The web runtime listens for an internal native command event with these
allowlisted commands:

- `notifications.request_snapshot`
- `notifications.mark_read`
- `notifications.mark_all_read`
- `notifications.open_action`
- `notifications.retry`

Each command carries a request ID, has strict payload validation, and returns
an action result or timeout. The native layer never fabricates notification
state after a failed command.

## 5. Bridge and Navigation Design

Keep the public bridge name and version at `ScrolithNative` / `2` for backward
compatibility. Add capabilities rather than changing existing method
semantics:

- `getCapabilities()` adds `nativeNotifications` and
  `nativeNavigationPilot`.
- `postEvent()` accepts only the new documented notification event names in
  addition to the existing `navigate`, `set_theme`, and `set_keyboard_mode`.
- Native events use the existing `CustomEvent` JSON envelope and a bounded
  payload size.
- Internal native commands are emitted through a single helper in
  `MainActivity`; no arbitrary JavaScript strings or URLs are accepted.

The activity should use a root container with a WebView and a native screen
host. Showing a native screen must pause only the WebView's visual interaction
as needed, not destroy it or its authenticated session. The fallback path
hides the native host and navigates the existing WebView to `/notifications`.

The native navigation pilot must use an explicit route table:

| Destination | WebView fallback |
| --- | --- |
| Home | `/member-home` |
| Messages | `/messages` |
| Scroll | `/scroll` |
| Match | `/match` |
| Profile | `/profile/edit` |

No destination may be derived by concatenating untrusted input. Deep links
continue to use `mobile/deeplinks.ts`, and notification actions must pass
through the same allowlist before navigation.

## 6. Feature Flag Plan

All flags default to false in release builds:

| Flag | Default | Purpose |
| --- | --- | --- |
| `native_navigation_pilot` | false | Enables the native shell bar with WebView routes |
| `native_notifications` | false | Enables the native Notifications Center |
| `native_notifications_shadow_sync` | false | Reserved for a later telemetry-only pilot |
| `native_notifications_actions` | false | Reserved; Phase 3 actions use the screen flag and web authorization |

Recommended enablement order:

1. Debug builds with explicit ADB extras.
2. Internal signed build restricted to test accounts/devices.
3. Release build with navigation pilot only, still disabled by default.
4. Native Notifications Center for a small allowlist, with remote kill switch.
5. Broader rollout only after physical-device and production canary evidence.

The remote flag, if introduced, is advisory only. A missing, malformed, or
unavailable remote response resolves to false. The native kill switch must be
able to force the WebView fallback without a database migration or app update.

## 7. Security and Privacy Controls

- Keep authentication and authorization in the existing web/API layer.
- Never expose access tokens, refresh tokens, cookies, or arbitrary user IDs
  through bridge methods or logs.
- Clear native notification state when the session expires, user changes, or
  logout completes.
- Validate notification IDs and action paths before forwarding commands.
- Do not use `/notifications/user/:userId` from user-facing code.
- Bound item count, title/message lengths, JSON size, and event frequency to
  prevent memory or UI abuse.
- Treat bridge events as untrusted input even though they originate in the
  WebView.
- Keep camera, microphone, FCM, and call behavior unchanged.
- Do not add notification content to Android logs or crash reports.

## 8. Failure and Rollback Behavior

- Bridge unavailable: open the existing WebView Notifications route.
- Snapshot timeout: show retry and preserve the WebView fallback action.
- Socket disconnect: show last in-memory state, request a web refresh, and
  never mark data as current without a successful response.
- Malformed event: discard it and record a non-sensitive diagnostic counter.
- Native screen crash: catch at the boundary, remove the native host, and
  continue in WebView.
- Flag service failure: resolve every Phase 3 flag to false.
- Any regression in auth, push, calls, messaging, or deep links: disable both
  Phase 3 flags and return to WebView behavior.

## 9. Test and Release Gates

### Automated

- Java unit tests for flag defaults, bridge capability shape, command
  allowlists, route allowlists, payload bounds, and session reset behavior.
- Web unit tests for notification envelope sanitization, event deduplication,
  mark-read delegation, and fallback navigation.
- Existing mobile and web builds must pass.
- Existing notification, messaging, authentication, deep-link, and call tests
  must pass without modification to their expected behavior.

### Physical-device matrix

- Android 10, 12, 13, and 15 where available.
- Small phone, large phone, gesture navigation, and three-button navigation.
- Cold start signed out and signed in.
- Notification snapshot, realtime update, mark-read, mark-all-read, and deep
  link activation.
- Offline entry, reconnect, timeout, malformed payload, and kill-switch
  fallback.
- Navigation between native pilot destinations and WebView screens.
- Back button, rotation/configuration change, background/foreground, logout,
  account switching, FCM notification tap, and incoming calls from every
  screen.
- Confirm that the conversation screen, attachments, message receipts, and
  calls remain WebView/native-call-path behavior.

### Artifact and rollout

- Proposed version: `1.2.0`, version code `109`, subject to release review.
- Build a signed AAB and provide SHA-256; do not upload to Google Play without
  explicit approval.
- If web bridge adapters are required, deploy the frontend separately through
  the existing 0% -> 25% canary process. A mobile-only shell change does not
  require an Azure deployment.
- Keep the native flags off in the first signed artifact until device evidence
  is reviewed.

## 10. Approval Gate

Implementation should begin only after approval of:

1. Hybrid Notifications Center as the first migrated screen.
2. WebView-owned auth, API, socket, and call behavior.
3. The bridge envelope and command allowlist.
4. Release-default-off feature flags and WebView fallback.
5. Proposed `1.2.0` / version code `109` scope.

No production deployment or Play upload is part of this design phase.
