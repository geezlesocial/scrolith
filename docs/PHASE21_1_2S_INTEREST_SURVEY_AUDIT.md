# Phase 21.1.2S — Interest Survey Audit

## Component

`ContentInterestSurvey` — prompt “Are you interested in this post/Scroll?” + Interested / Not interested.

## Selection

`pickInterestSurveyCandidateIds` — requires viewer id; excludes own content; excludes prior signal; stable hash ranking; default limit 4.

## Surfaces

| Surface | Mount path | Limit |
|---------|------------|-------|
| Member Home | `MemberHomeSection` → `PostEngagementBar` | 4 (aligned 21.1.2S) |
| Mobile feed | `MobileFeed` → `PostEngagementBar` | multi set |
| Community | `CommunityHome` → `PostEngagementBar` | 5 |
| Scroll | `/scroll` → `ScrollFeed` → `ScrollCard` | 4 |

## Ineligible

Ads, marketplace, jobs, gigs, people, pages, events, own posts, already-signaled posts.
