# Scrolith Android Phase 4 Technical Design

**Feature:** Hybrid Native Messages List
**Status:** Implemented; release flag off; feature-on validation pending web adapter deployment
**Baseline:** Android `1.2.0` / version code `109`, Phase 1-3 Native Shell and Bridge v2

## 1. Decision Summary

Build a feature-flagged native conversation inbox while keeping the existing
WebView conversation screen as the only production owner of message transport,
authentication, socket state, read receipts, attachments, calls, and routing.

The native list will receive sanitized snapshots projected by the authenticated
web runtime. It will not create an API client, Socket.IO connection, token
store, cookie store, or alternate unread-state database. A malformed, stale, or
unavailable snapshot falls back to the existing `/messages` WebView route.

Release builds keep `native_messages_list_enabled` disabled. Implementation
follows this design; feature-on device validation requires the web adapter to be
deployed alongside the Android artifact. Android deployment and promotion are
separate release decisions.

## 2. Read-Only Audit

### Web inbox and state ownership

- `geezle/src/messages/Messages.tsx` owns the current Messages workspace and
  keeps the conversation thread, composer, attachments, calls, group controls,
  and search behavior together.
- `geezle/src/components/messaging/MessagingConversationList.tsx` renders the
  current list states and delegates row activation.
- `geezle/src/components/messaging/MessagingConversationRow.tsx` renders
  direct, group, and community rows with unread, timestamp, avatar, pinned,
  muted, starred, category, presence, and attachment-preview indicators.
- `geezle/src/context/MessageContext.tsx` is the authoritative inbox state.
  It refreshes conversations, merges duplicate direct conversations, sorts by
  recent activity, manages unread/read ownership, and coordinates search,
  typing, presence, receipts, optimistic state, and retry behavior.
- `geezle/src/services/messaging.ts` normalizes the API response and calls
  `GET /messages/conversations` with a bounded limit, cursor, five-message
  preview, and optional `updatedSince` delta. It calls
  `POST /messages/conversations/:id/read` for read state.

### Backend contracts

- `geezle-backend/src/routes/messages.routes.ts` registers the authenticated
  inbox, conversation, read, receipt, preference, presence, attachment, and
  call routes.
- `listConversations` in
  `geezle-backend/src/controllers/messages.controller.ts` restricts normal
  users to active `ConversationParticipant` rows, orders by `updatedAt` and
  `id`, supports a cursor, caps the page at 200, and includes a bounded recent
  message preview. Attachment metadata is batched and preview-aware.
- `getConversation` independently enforces participant membership before
  returning a thread. A native row cannot grant access; the existing server
  check remains authoritative.
- `markRead` updates the authenticated participant's read/delivery watermark
  and emits `messages:read` and receipt events. The request body must not be
  used as an identity source.
- `Conversation` contains type, group metadata, activity timestamps, and
  message preview fields. `ConversationParticipant` contains per-user read,
  muted, starred, archived, label, role, notification, and deletion state.
- User projections include avatar identifiers, online/last-seen values, and
  visibility controls. Presence is privacy-sensitive and must be omitted when
  the current policy does not permit it.

### Realtime and session behavior

- `geezle/src/context/SocketContext.tsx` owns socket lifecycle and reconnects
  only for the authenticated user and current network state.
- `MessageContext` directly consumes message, read, receipt, typing, presence,
  conversation-update, and conversation-delete events. It deduplicates by
  message/conversation identity and applies server state to the inbox.
- WebView cookies, local storage, authentication, and the existing socket stay
  inside the WebView. Phase 4 must not duplicate any of them in Android.

### Navigation and native baseline

- `/messages` and `/messages/:conversationId` are existing allowed web routes.
- Android `MainActivity` owns the single WebView, deep-link validation,
  lifecycle, FCM/call delivery, and native screen host.
- `ScrolithNativeBridge` is version `2`, validates trusted origins, bounds
  payloads, and exposes no credentials or arbitrary JavaScript execution.
- Phase 3 already provides a feature-flagged native Notifications host and a
  WebView-backed navigation pilot. Phase 4 extends these boundaries only.
- Current Android dependencies do not include a native conversation-list
  implementation. The approved implementation should use a small AndroidX
  RecyclerView-based surface, or an already-approved equivalent, without
  changing the WebView ownership model.

## 3. Phase 4 Scope

### Native in this phase

- Full-screen conversation inbox presentation.
- Loading, empty, offline, stale, and retry states.
- Direct, group, and community row presentation.
- Most-recent ordering, unread count, timestamp, typed preview kind, and
  available mute/star/pin indicators.
- Basic local search and category filters for the loaded snapshot.
- Pull-to-refresh delegated to the web runtime.
- Row activation delegated to the existing `/messages/:id` route.
- Native list back handling and fallback to WebView.

### Remains WebView-owned

- Conversation thread and message history.
- Sending, editing, deleting, reactions, receipts, typing, recording, and
  delivery state.
- Attachments, voice notes, voice/video calls, call signaling, and permissions.
- Authentication, authorization, cookies, local storage, and socket lifecycle.
- Server search and all backend message protocol behavior.
- Existing web Messages UI, which must remain unchanged and available whenever
  the flag is off or native state is unhealthy.

## 4. Proposed Data Flow

```text
Authenticated WebView
  -> MessageContext + existing HTTP/socket services
  -> bounded messages:list snapshot
  -> Android native inbox projection
  -> messages:list command to WebView
  -> existing route/service/state owner
```

The web runtime remains the only source of truth. On initial native-list open,
Android requests a snapshot. MessageContext sends the current normalized list;
subsequent message/read/presence/conversation events cause a debounced snapshot
or a bounded delta. Android replaces or diffs rows by stable conversation ID.

No snapshot is accepted unless it has the current bridge version, a matching
runtime session binding, a valid kind, bounded item count, and valid field
types. Snapshot freshness is tracked in memory only.

## 5. Bridge Contract

Keep `ScrolithNative` and Bridge v2 unchanged for existing consumers. Add the
messages capability and allowlisted event names only after implementation is
approved.

### Web-to-native envelope

```json
{
  "bridgeVersion": "2",
  "requestId": "opaque-request-id",
  "kind": "snapshot",
  "sessionBinding": "opaque-runtime-session",
  "revision": 12,
  "items": [
    {
      "id": "conversation-id",
      "type": "direct | group | community",
      "title": "Display name",
      "avatarPath": "/media/avatar-or-empty",
      "preview": { "kind": "text | image | video | audio | voice | file | empty", "text": "Preview" },
      "lastMessageAt": "2026-09-06T00:00:00.000Z",
      "unreadCount": 2,
      "isMuted": false,
      "isStarred": false,
      "isPinned": false,
      "presence": { "state": "online | offline | unknown", "lastSeenAt": null },
      "actionPath": "/messages/conversation-id"
    }
  ],
  "unreadCount": 2,
  "hasMore": false,
  "serverTime": "2026-09-06T00:00:00.000Z"
}
```

Contract rules:

- Maximum 100 native rows per snapshot in the first implementation, with
  `hasMore` exposed. Large-list pagination is deferred until the existing web
  cursor flow can be projected without a second data owner.
- IDs, strings, timestamps, and counts are strictly bounded and type checked.
- `preview.kind` must come from normalized message/attachment data. The native
  UI must not infer a media type from arbitrary preview text.
- `avatarPath` may be an existing Scrolith-owned HTTPS path or a safe asset
  identifier already supported by the web runtime. No access token, cookie,
  signed credential, filesystem path, or arbitrary host crosses the bridge.
  If a safe authenticated media path cannot be rendered natively, use initials.
- Presence and last-seen fields are included only when the existing visibility
  policy permits them; otherwise use `unknown` and omit the timestamp.
- `actionPath` is generated by the web runtime, internal-only, and validated by
  the existing path allowlist. Native never constructs a route from arbitrary
  user input.
- No raw socket payloads, message bodies beyond the bounded preview, hidden
  participant data, admin lookups, or secrets are forwarded.

### Allowlisted commands

The native list may send only:

- `messages.request_snapshot`
- `messages.refresh`
- `messages.open_conversation`
- `messages.mark_read`
- `messages.retry`
- `messages.close`

Commands contain a request ID, session binding, and bounded payload. For
`open_conversation`, the web runtime must verify that the selected ID and
action path came from the current snapshot, then use the existing router.
`mark_read` delegates to the existing `MessageContext`/messaging service and
does not write read state directly from Android.

## 6. Realtime Consistency

1. WebView receives the existing socket event.
2. `MessageContext` applies its current dedupe/merge/read rules.
3. The web adapter emits a new revision or a coalesced snapshot.
4. Android discards stale revisions and applies a stable-ID diff.
5. Native rows never synthesize unread counts or message ordering after a
   failed command.

Opening a conversation hides or suspends the native list and navigates the
existing WebView conversation route. The existing visible-conversation logic
marks it read. When the user returns, the WebView sends a fresh snapshot.

If the bridge does not acknowledge a request within a short bounded timeout,
or if no fresh snapshot arrives after reconnect, Android hides the native host
and loads `/messages`. This preserves access to the proven inbox and prevents
native stale state from becoming authoritative.

## 7. UI and Navigation Design

- Use a native AndroidX list with stable IDs and diff-based updates. Rows must
  have fixed minimum height, accessible touch targets, and no layout shift when
  unread badges or preview labels change.
- Keep the existing Scrolith visual language: restrained white/surface panels,
  navy text, blue active states, compact metadata, and familiar status icons.
- Provide an app bar with Messages, connection state, refresh, and back; a
  search field; All, Unread, Groups, and Communities filters; and a clear empty
  state. Search is local to the currently loaded, authorized snapshot.
- Use initials or a neutral placeholder when an avatar cannot be safely loaded.
  Do not add a native image downloader that bypasses existing auth controls.
- Messages bottom-navigation selection opens the native list only when both
  the navigation pilot and messages-list flags are enabled. Otherwise it
  continues to `/messages`.
- Back from the native list returns to the prior native/WebView destination.
  Back from a conversation remains the existing WebView behavior.

## 8. Feature Flag and Rollback

| Flag | Release default | Debug override | Purpose |
| --- | --- | --- | --- |
| `native_messages_list_enabled` | `false` | `scrolith_native_messages_list` | Enables the native inbox host |

The flag is valid only in debuggable builds for initial validation. It must not
be remotely enabled in a release artifact while the implementation is in pilot
status. Flag off must preserve the current Messages route byte-for-byte in
behavior. A runtime kill switch may later disable the host without changing
message data or WebView state.

## 9. Security and Privacy Controls

- Trust checks remain enforced on every JavaScript-interface call.
- Native receives only the current authenticated user's projection; no query
  parameter or payload user ID is trusted for authorization.
- Server membership and deleted-participant checks remain mandatory on every
  conversation open and read operation.
- Do not log message text, avatar URLs, participant lists, tokens, cookies, or
  bridge payloads. Telemetry may contain event names, bounded result counts,
  latency, and failure codes.
- Clear memory-only snapshots and session bindings on logout, user change,
  WebView renderer recovery, or origin change.
- Reject external URLs, JavaScript URLs, control characters, oversized JSON,
  duplicate IDs, invalid timestamps, and unknown command names.

## 10. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Native unread state diverges | WebView remains authoritative; read actions delegate; refresh after return |
| Duplicate or missed realtime rows | MessageContext owns socket dedupe; native uses revision and stable-ID diff |
| Stale account appears after switching | Session binding and user-change clearing; fallback on mismatch |
| Conversation access is spoofed | Server membership checks plus web-runtime path validation |
| Attachment preview is misleading | Typed normalized preview contract; conservative `file`/`empty` fallback |
| Avatar leaks credentials | Same-origin safe paths only; initials fallback; no native token client |
| Large inbox harms memory or frame rate | Bounded snapshot, RecyclerView diffing, no duplicate socket, measured list size |
| Calls or composer regress | Thread and call screens remain WebView-owned; flag-off regression gate |
| Bridge or web adapter failure | Timeout, retry, native-host removal, and `/messages` fallback |

## 11. Implementation and Test Gates

Implementation proceeded after approval of this design. The frontend bridge is
on `feature/native-messages-list-phase4`; the Android/root changes are on
`feature/native-messages-list-phase4-android` because the shared remote already
contained the frontend branch name.

Required automated coverage:

- Envelope validation, bounds, session binding, revision ordering, duplicate
  rejection, safe paths, and command allowlisting.
- Web adapter projection for direct, group, community, unread, muted, starred,
  pinned, attachment, presence, deleted, and empty states.
- Android state transitions for loading, snapshot, refresh, stale, error,
  fallback, row activation, and back handling.

Required physical-device validation using real authenticated accounts and real
production-like data, with no mocks:

- Flag off: existing WebView Messages list, auth, deep links, calls, FCM,
  attachments, and conversation behavior.
- Flag on: cold start, inbox load, ordering, unread counts, groups, search,
  refresh, offline/error recovery, real-time new/read updates, and open/return.
- Calls arriving while the native list is visible, background/foreground,
  account switching, logout/login, renderer recovery, and multiple screen sizes.
- Smooth scrolling with a large real inbox and no duplicate or missing rows.

Any failure in authentication, message delivery, read state, calls, FCM, or
deep links blocks release and disables the native flag.

## 12. Release Plan After Approval

1. Implement the web adapter and native list on the dedicated branches.
2. Run unit, Android, frontend, and physical-device regression tests.
3. Bump version from `1.2.0/109` only after the tested scope is known.
4. Produce signed AAB and APK with SHA-256; do not upload to Google Play.
5. If a web adapter is shipped, deploy its frontend revision separately with
   the native flag off and verify the existing `/messages` path first.
6. Deploy Android artifacts only through the explicitly approved distribution
   process. No production promotion is implied by this design.

## 13. Approval Gate

This document is the Phase 4 audit and technical design deliverable. The owner
approved the data contract and fallback plan; implementation, commits, and
artifact builds are complete. Production promotion remains separately gated.
