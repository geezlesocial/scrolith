# Phase 21.1.2 — Avatar Adoption Audit

## Component

`geezle/src/components/common/EnterpriseAvatar.tsx`

**Fallback priority**

1. Uploaded / resolved profile photo (`src` or `resolveUserAvatarUrl(user)`)
2. Instant initials layer (never blank white)
3. Deterministic HSL background + white accessible foreground
4. Graceful `onError` → initials only

**Loading**

- Initials always painted underneath
- Image fades in (`opacity` transition)
- Lazy load via OptimizedImage
- Source change resets failed/loaded state

## Adopted / updated surfaces (21.1.2)

| Surface | File |
|---------|------|
| Desktop navbar profile | `Navbar.tsx` |
| Mobile drawer | `MobileDrawerNav.tsx` |
| Mobile account sheet | `MobileHomeSheets.tsx` |
| Mobile feed authors | `MobileFeed.tsx` |
| Mobile search results | `SearchScreen.tsx` |
| Suggested people/pages | `SuggestedCard.tsx` |
| People You May Know | `PeopleYouMayKnowRail.tsx` |
| Follow onboarding | `FollowOnboarding.tsx` |
| Comment system (forum) | `CommentSystem.tsx` |
| Post comments | `PostComments.tsx` |
| Thread header | `ThreadDetail.tsx` |
| Leaderboard | `Leaderboard.tsx` |
| Community chat | `Chat.tsx` |
| Reaction reactors | `ReactionReactorsModal.tsx` |
| Messaging list | `MessagingConversationRow.tsx` (prior) |
| Messaging chat header | `MessagingChatWindow.tsx` |
| Desktop messaging dock | `DesktopMessagingDock.tsx` |
| Full Messages page | `Messages.tsx` |
| Post header | `PostHeader.tsx` (prior) |
| Feed mixed cards | `FeedMixedCard.tsx` (prior) |
| Story author avatar | `StoryAuthorAvatar.tsx` |
| Freelancer profile + reviews + followers | `FreelancerProfile.tsx` |

## Helpers improved

`SafeAvatarName` / `SafeAvatarInitials` now accept plain strings and first/last name snake_case fields.

## Remaining long-tail (non-blocking)

Admin consoles, Live studio grids, some marketplace seller chips, GroupsWorkspace entity images, StoryReplySheet remote ui-avatars fallbacks, GuestSections demos, constants mock data. These are lower traffic; EnterpriseAvatar can be applied incrementally without architecture change.

## Policy

- Prefer `EnterpriseAvatar` for **people** profile images.
- Group/page brand marks may keep square media frames where design requires non-circular branding, but must not show blank white.
