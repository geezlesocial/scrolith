# Phase 20.2.4 — Enterprise Mentions, Tags, Comment Assistant, Realtime Social Notifications

## Architecture

Extends existing Scrolith mention infrastructure without replacing:

| Layer | Role |
|-------|------|
| Client autocomplete | `MentionHashtagTextarea` + `/community/mentions/users` |
| Server parser | `mentions.enterprise.service` (authoritative) |
| Persistence | `Mention` + `MentionRecipient` (additive) |
| Notifications | Existing `createEngagementNotification` (`mention_post` / `mention_comment`) |
| Scrolitha | Existing `maybeQueueScrolithaMentionReply` + `@AI` alias |
| Realtime | Existing `community:post_comment_created` + notification socket |

## Mention kinds

| Kind | Token examples | Fan-out |
|------|----------------|---------|
| USER | `@ibrahim` | Resolved username → notification |
| EVERYONE | `@everyone` | Author-only; followers; rate limited |
| MODERATORS | `@moderators` / `@mods` | Club moderators+admins+owner |
| ADMINS | `@admins` | Club admins+owner |
| SCROLITHA | `@Scrolitha` / `@ai` | AI reply queue; no human notify |
| RESERVED | `@verified` / `@staff` | Parsed only; no fan-out |

## Lifecycle

1. User types `@` → autocomplete (debounced ranked search).
2. Insert is client-only text (`@username `).
3. On create comment/post, server re-parses content.
4. Resolves targets, filters blocks/inactive, expands collectives.
5. Persists `Mention` + `MentionRecipient`.
6. Sends deduped notifications.
7. If Scrolitha mentioned → queue AI reply (idempotent).

## API

- `GET /api/community/mentions/users?q=&clubId=&limit=` — ranked autocomplete
- Existing post/comment create paths — enterprise fan-out on comments

## Realtime events

- `community:post_comment_created` (includes `scrolithaPending`)
- Notification push via existing user channel
- Scrolitha reply as normal comment create events

## Security

- Client never trusted for recipient lists
- Block graph filtering
- Visibility checks before notify
- `@everyone` author-only + hourly rate limit + max recipients
- Community specials require `clubId`
- No private profile enumeration beyond username/name search of active users

## Rollback

1. Feature-flag style: leave tables in place; stop writing in code revert.
2. Drop not required for emergency; old `CommunityPost.mentions[]` path remains.
