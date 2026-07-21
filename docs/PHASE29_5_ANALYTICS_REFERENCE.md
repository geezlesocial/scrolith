# Phase 29.5 — Analytics Reference

## Platform analytics (`buildPlatformGroupAnalytics`)

Window: 1–90 days (default 14)

| Metric | Source |
|--------|--------|
| totalGroups | Conversation type GROUP |
| groupsCreated | createdAt in window |
| messages | DirectMessage in GROUP |
| voiceNotes | messageType VOICE_NOTE |
| locked / announcement | messagingMode |
| averageMembers | avg memberCount |
| series | daily messages + attachment refs |

## Health score (`computeGroupHealthScore`)

Composite 0–100 from:

- activity (msgs today/week)
- engagement (unique senders)
- retention / participation balance
- inverted spam velocity
- inverted moderation burden

**Surface score + flags only** — no automated AI decisions.

## Admin UI

Overview + Analytics tabs consume 29.4 overview and 29.5 analytics/health samples.
