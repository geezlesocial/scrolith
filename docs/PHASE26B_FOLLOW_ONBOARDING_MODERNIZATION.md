# Phase 26B — Follow-Onboarding Mobile Modernization & UX Hardening

**Status:** Implemented (not deployed)  
**Route:** `/auth/follow-onboarding`  
**Date:** 2026-07-20  
**Deployment:** Deferred to **Phase 26C — Follow-Onboarding Deployment & Production Certification**

---

## 1. Existing implementation audit

### Flow map

```
/auth/follow-onboarding
  → App route guard (auth + hasPendingFollowOnboarding)
  → React.lazy FollowOnboarding
  → AuthService.getFollowOnboarding()          GET /api/auth/follow-onboarding
  → LanguagePreferencesService.getMine()       GET language prefs (Phase 26)
  → Parallel recommendations:
      RecoService.getAccounts (who_to_follow + member_home × freelancer/client/page)
      CommunityService.getRecommendedBusinessPages
      CommunityService.getTopContributors
  → CommunityService.getFollowStatus(userIds)
  → Interleave + cap (≤3 users, ≤3 pages, ≤6 total) with session rotation seed
  → Optimistic follow → CommunityService.followTarget
  → Continue:
      LanguagePreferencesService.updateMine({ confirm: true })
      AuthService.completeFollowOnboarding()   POST /api/auth/follow-onboarding/complete
  → updateUser (clear followOnboardingRequired)
  → navigate(redirectPath || '/', { replace: true })
  → Phase 21 feed uses confirmed follow graph
```

### Exact files & components

| Area | Path |
|------|------|
| Page | `geezle/src/auth/FollowOnboarding.tsx` |
| Progress / gate helpers | `geezle/src/auth/followOnboardingLogic.ts` |
| Language picker | `geezle/src/components/language/LanguageMultiSelect.tsx` |
| Language catalog | `geezle/src/utils/supportedLanguages.ts` |
| Language prefs API | `geezle/src/services/languagePreferences.ts` |
| Auth onboarding API | `geezle/src/services/authService.ts` |
| Route / chrome | `geezle/src/App.tsx` |
| Messaging dock exclusion | `geezle/src/services/messagingSurfaces.ts` |
| Redirect helper | `geezle/src/utils/authRedirect.ts` |
| Styles | `geezle/src/index.css` (`.follow-onboarding-*`) |
| Backend status/complete | `geezle-backend/src/services/followOnboarding.service.ts` |
| Backend routes | `geezle-backend/src/routes/auth.routes.ts` |

### APIs & hooks

- `AuthService.getFollowOnboarding` / `completeFollowOnboarding`
- `LanguagePreferencesService.getMine` / `updateMine`
- `RecoService.getAccounts` + `submitFeedback`
- `CommunityService.getRecommendedBusinessPages`, `getTopContributors`, `getFollowStatus`, `followTarget`
- `useUser()` for identity + `updateUser` after complete

### Existing breakpoints (Tailwind)

- Mobile-first base; `sm:` (~640px) 2-col reco grid + desktop continue; sticky CTA `sm:hidden`
- `lg:` two-column page grid `[0.9fr_1.25fr]`
- Safe-area: `env(safe-area-inset-top/bottom)` on shell + sticky footer

### Root mobile issues (pre-26B)

1. Full **Navbar** + dense product navigation on a mandatory onboarding step
2. **DesktopMessagingDock** overlapping bottom-right controls on narrow viewports
3. Wide two-column density forced on phones → long scroll through promotional copy
4. Progress copy risked implying **6 selections required** (presentation max ≠ minimum)
5. Recommendation cards oversized for touch; follow/preview competition on small widths
6. Language list usable but not optimized for 44px targets / mobile keyboard
7. Sticky completion action missing on mobile

### Root UX issues

- Equal visual weight on nested bordered boxes
- Explanatory paragraphs competed with primary tasks (language + follow)
- Disabled continue without always-visible “what’s missing” on mobile viewport
- Messaging launcher distraction during first-run focus

### Root performance issues

- Multiple parallel reco surfaces (acceptable; already Promise.allSettled)
- Large page component; mitigated with route-level `React.lazy` (unchanged)
- Progress recalculation pure; cards still re-render on follow (acceptable at ≤6 cards)
- Language filter is local (no per-keystroke network) — preserved

### Business rules (preserved — repository truth)

| Rule | Value | Source |
|------|-------|--------|
| Min languages | **1** | FE gate + Phase 26 prefs |
| Min follows | **1** | `FOLLOW_ONBOARDING_MIN_REQUIRED` backend + FE |
| Max selectable (presentation) | **6** total (3 users + 3 pages) | FE caps + backend `maximumSelectable` |
| Completion redirect | **`/`** | `FOLLOW_ONBOARDING_REDIRECT_PATH` |
| Server authority | Follow counts + completion flag | `followOnboarding.service.ts` |
| Language privacy | Understood languages ≠ nationality | Phase 26 copy + prefs API |

**No product decision changed business rules.** FE continues to require languages **and** follows before Continue; completion API still enforces follow minimum server-side; languages are persisted immediately before complete.

### Recommendation identity behavior

- Stable keys: `user:{id}` / `page:{id}`
- Merge + dedupe across reco surfaces
- Session rotation seed for interleave order (stable for mount lifetime)
- No list rebuild after individual follow (local `isFollowing` toggle only)
- Optimistic follow with rollback on API failure; Continue not permanently unlocked on failed follow

---

## 2. Responsive architecture

### Mobile (&lt; sm)

1. Compact Scrolith onboarding header (logo + “Onboarding” chip) — **no full Navbar**
2. Purpose title + short purpose statement
3. Progress (min-based, a11y progressbar)
4. Language multi-select (search + chips + list)
5. Collapsible “Why we ask this”
6. Recommendations (vertical list; All / People / Pages chips)
7. **Sticky bottom Continue** with missing-hint text + safe-area padding

### Tablet (sm–lg)

- Two-column reco cards where width allows
- Sticky CTA still mobile-only; desktop-style continue in panel from `sm:`

### Desktop (lg+)

- Two-column page: guidance/progress/languages | recommendations
- Columns top-aligned; max width `max-w-6xl`
- Full continue control inside recommendations panel

### Messaging widget decision

**Hide** floating messaging dock on `/auth/follow-onboarding` via `isMessagingDockExcludedPath` and `isFollowOnboardingRoute` App gate. Full `/messages` workspace remains available after onboarding. Support is not required mid first-run setup.

---

## 3. Visual system

Hierarchy:

1. Page background (soft blue radial gradient)
2. Primary panels (`follow-onboarding-panel`)
3. Secondary surfaces (progress, language block)
4. Interactive reco cards (selected = emerald surface)
5. Sticky action bar (mobile)

Improvements: reduced equal-weight nesting; clearer primary CTA; 44×44 touch targets; focus-visible rings; reduced-motion respected.

---

## 4. Component structure

```
FollowOnboarding (page)
  ├─ Onboarding header (inline)
  ├─ Progress block (inline, uses followOnboardingLogic)
  ├─ LanguageMultiSelect
  ├─ Why accordion
  ├─ Recommendation filters + cards
  └─ Sticky / desktop continue

followOnboardingLogic.ts  — pure gates, progress %, caps, hints
```

Further split into hooks is optional; pure logic extraction covers testability without API rewrites.

---

## 5. Language picker

- Searchable multi-select; native + English; **no flags**
- Alias / code / native search via `searchLanguages`
- Selected chips with remove; min-1 messaging
- `dir="auto"` + `lang={code}` for RTL names
- Mobile: full-width list, `min-h-[44px]` rows, `text-base` input (reduces iOS zoom), capped list height with scroll

---

## 6. Recommendation cards

- Avatar, name, username, badge, following state
- Concise headline / reason; up to 3 reason chips
- Preview link + Follow action (44px min)
- Optimistic Added state; rollback on failure
- Single column on narrow; 2-col from `sm:`

---

## 7. Progress redesign

- Steps: Languages (min 1) + Follows (min server `minimumRequired`, default 1)
- Explicit “up to 6” as **optional maximum**, not requirement
- `role="progressbar"` with valuetext covering language/follow status
- Missing hint always visible near Continue

---

## 8. Android WebView compatibility (design evidence)

| Concern | Mitigation |
|---------|------------|
| Viewport / overflow | `overflow-x: clip`, `max-w-6xl`, `min-w-0` on flex children |
| Status bar | `pt-[max(0.75rem,env(safe-area-inset-top))]` |
| Bottom nav / gesture | sticky `pb` with `safe-area-inset-bottom` |
| Keyboard | language search `type="search"`, list scroll independent of sticky CTA |
| Android back | route remains standard history; completion uses `replace: true` |
| Messaging overlap | dock unmounted on this route |
| Touch | 44px controls |

Device lab (Android 12–15) physical certification is **Phase 26C**.

---

## 9. RTL

- Language labels use `dir="auto"`; page chrome stays LTR (selecting Arabic does **not** flip entire layout)
- Native Arabic name searchable and displayable

---

## 10. Accessibility

- Heading hierarchy: h1 page title, h2 recommendations, card titles as h2 within articles (scannable names)
- Progress: `role="status"` + `progressbar` + live missing hint
- Follow buttons: explicit `aria-label`
- Language options: `aria-pressed`, selection status `aria-live`
- Focus-visible outlines in shell CSS
- Reduced motion: CSS + Tailwind `motion-reduce`

---

## 11. Security

- Onboarding endpoints remain auth-middleware protected
- Language prefs write only “mine”
- Follow actions go through existing authorized community follow API
- No tokens in URLs from this page
- User-facing errors sanitized (message fields, not stack traces)
- Recommendation bios rendered as text (React default escaping)

---

## 12. Performance

| Item | Notes |
|------|-------|
| Route JS | Already `React.lazy` FollowOnboarding |
| Language filter | Local catalog — no network per keystroke |
| Reco load | Parallel allSettled; empty state + retry |
| Card count | Hard-capped ≤6 — low render cost |
| Layout shift | Avatar sizes reserved; skeleton cards fixed min-height |

Before/after quantitative Lighthouse on production host is **Phase 26C**. Structural improvements (hide nav/dock, fewer dense panels, sticky CTA without extra widgets) reduce main-thread and interaction friction on mobile.

---

## 13. Tests

| Suite | Path |
|-------|------|
| Unit logic + static contracts | `geezle/tests/unit/phase26bFollowOnboarding.test.ts` |
| Messaging dock exclusion | `geezle/tests/unit/messagingDockRouteVisibility.test.ts` |

Coverage: business gates, progress semantics, follow caps, language search (en/native/code/alias), dock hide, sticky CTA markers, App chrome gates, a11y/CSS markers.

---

## 14. Known limitations

- No dedicated bottom-sheet modal for languages (inline list is WebView-safer)
- Unfollow UI not exposed on this step (follow-only onboarding; max caps apply)
- Backend completion still only validates follows (languages enforced client-side at Continue + prefs API)
- Full visual regression screenshots / Android lab → Phase 26C
- No new backend metrics counters shipped in 26B (client-side structural only)

---

## 15. Migration requirement

**None.** No schema or API contract changes.

---

## 16. Deployment recommendation

- **Do not deploy in Phase 26B.**
- Promote frontend (and monorepo docs) in **Phase 26C** after:
  - Smoke on staging `/auth/follow-onboarding` at 320–1280px
  - Android WebView walkthrough (keyboard, sticky, complete)
  - Regression: Phase 21 feed identity, 23 Scroll, 24 Community, 25 push, 25C OAuth, 26 language prefs
  - OAuth + password signup still land on follow-onboarding when required

---

## 17. Phase 26C deployment plan (preview)

1. Build/promote `geezle` frontend revision containing FollowOnboarding + chrome gates
2. Confirm backend unchanged (no migration)
3. Smoke: signup → follow-onboarding → language + follow → complete → `/` feed
4. Verify completed users skip onboarding; unauthenticated redirect to login
5. Cert metrics + completion gate `deploymentPerformed: true` only after promote
6. Rollback: previous frontend Cloud Run revision (UI-only rollback)

---

## 18. Completion gate

See `geezle/playwright-results/phase26b/completion-gate.json`.

`deploymentPerformed: false` by design.
