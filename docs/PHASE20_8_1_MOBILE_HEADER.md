# Phase 20.8.1 — Mobile Header

## Target

`[ Back ] [ Avatar ] [ Name + status ] [ Call ] [ More ]`

## Changes

| Item | Decision |
|---|---|
| Name | Truncates with `min-w-0` / truncate classes |
| Status | Online/Offline short label on mobile |
| Gender badge | **Removed from compact mobile conversation header and inbox row** |
| Gender data | Still available on profile/details; not deleted globally |
| Scrolitha verification | Preserved without gender crowding |
| Touch targets | ~44×44 px for primary icon actions |

## Code

`Messages.tsx` — gender render gated:

```tsx
{!isMobileViewport && otherParticipant?.gender ? ( … ) : null}
{!isMobileViewport && participant?.gender ? ( … ) : null}
```

## Desktop

Gender and extended last-seen metadata remain on desktop header when present.
