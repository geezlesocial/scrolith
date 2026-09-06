# Scrolith Android 1.3.2

- Reduced mobile header and bottom navigation dimensions for smaller screens.
- Kept the search control as a compact, click-to-open label instead of an always-open field.
- Scoped mobile member-home header, menu, and tabs to the member-home route so messages, profile, community, dashboard, jobs, and other pages do not receive duplicate chrome.
- Added route-aware handling for the optional Android navigation pilot to prevent native tab overlap on non-home pages.
- Preserved existing authentication, realtime messaging, calls, notifications, account switching, and WebView fallback behavior.
