# Apps Tracking 400 Fix

The failing mobile event was `push_token_project_reset`. It was emitted by the frontend but missing from the backend `KNOWN_EVENTS` set, so the backend returned `400 Unsupported app tracking event`.

The backend now accepts the event. The frontend validates event names, normalizes platform fields, bounds detail keys and string sizes, and marks tracking requests as no-retry. Tracking remains best-effort and cannot block navigation or messaging.
