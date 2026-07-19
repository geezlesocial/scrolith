# Phase 21.1.5 — Post Card Design System Visual QA

**Commit:** (fill after push)  
**Surfaces:** Member Home · Community · Mobile Web · Android wrapper  
**Automated contract suite:** `tests/unit/postCardVisualQaChecklist.test.ts`, `tests/unit/enterpriseSpacingScale.test.ts`, `tests/unit/postCardDesignSystem.test.ts`

## Enterprise Spacing Scale

```ts
spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 }
```

CSS vars on `:root`: `--scrolith-space-xs` … `--scrolith-space-xxl`  
Post cards consume scale via `postCardDesign.ts` → `enterpriseSpacing.ts`.

## Operator checklist

Run on **Desktop Chrome**, **Mobile Chrome** (DevTools + real phone), **Android Capacitor wrapper**.

| # | Scenario | Pass criteria | Desktop | Mobile Chrome | Android |
|---|----------|---------------|---------|---------------|---------|
| 1 | Very long username `@this_is_an_extremely_long_username_that_should_not_break_layout` | Name/username truncate; Follow + More stay top-right; no wrap under avatar | ☐ | ☐ | ☐ |
| 2 | 15–20 paragraph post + emoji + #tags + @mentions + URLs | 5-line clamp; **More...** then expand; **Less** collapse; no card collapse | ☐ | ☐ | ☐ |
| 3 | AI Coach visible | Height ≥ 72px identical; CTA right; no overflow | ☐ | ☐ | ☐ |
| 4 | Reco chips 2 / 5 / 10 | Wrap with 8px gap; min-height 32px; no overlap | ☐ | ☐ | ☐ |
| 5 | Interest survey | Interested / Not interested equal width & 42px height; no wrap; works on ~360px width | ☐ | ☐ | ☐ |
| 6 | See translation | Row appears; title/body stay stable; no jump | ☐ | ☐ | ☐ |
| 7 | Images portrait / landscape / square / missing | Reserved frame; no feed jump on load/error | ☐ | ☐ | ☐ |
| 8 | Post without AI Coach | Section gaps still 12px between remaining blocks | ☐ | ☐ | ☐ |
| 9 | Marketplace card in feed | Does **not** use post section stack / coach padding | ☐ | ☐ | ☐ |
| 10 | Job card in feed | Same isolation | ☐ | ☐ | ☐ |
| 11 | Community reco / listing card | Same isolation | ☐ | ☐ | ☐ |
| 12 | Dark mode (`data-theme=dark` / Settings) | Cards readable; survey dark path on Scroll OK | ☐ | ☐ | ☐ |

## DevTools selectors

```text
[data-testid="enterprise-post-card"]
[data-post-card-design="21.1.5"]
[data-testid="post-header"]
[data-testid="post-ai-coach-card"]
[data-testid="post-engagement-bar"]
[data-testid="post-action-row"]
[data-testid="content-interest-survey"]
[data-testid="translatable-post-text"]
```

## Automated gate (CI / local)

```bash
node --import tsx --test \
  tests/unit/enterpriseSpacingScale.test.ts \
  tests/unit/postCardDesignSystem.test.ts \
  tests/unit/postCardVisualQaChecklist.test.ts
```

## Deployment recommendation

1. Automated suite green.
2. Operator fills matrix above (at least Mobile Chrome + Android wrapper for items 1–8).
3. Merge design-system commit(s).
4. Stage Cloud Run FE revision (10–20% or internal).
5. Smoke Member Home / Community / Mobile Web / Android.
6. Promote to 100% if no layout regressions.

**Backend / feed ranking:** unchanged. Rollback = frontend revision revert only.
