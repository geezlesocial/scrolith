# Phase 33.2 — Recommendation Architecture

## Principle

**AI supplies scores and suggestions only.** Deterministic feed ranking and search execution remain authoritative.

```
User / Feed / Search / Dashboard
  → Scrolitha Discovery APIs
  → Memory + heuristics (+ optional ScrolithaAI.execute)
  → Explainable cards / advisory scores
  → Host product applies or ignores
```

## Components

| Module | Role |
|--------|------|
| `feedScoring.ts` | Advisory feed relevance scores |
| `recommendations.ts` | Entity recommendations + dashboard sections |
| `semanticSearch.ts` | Query expand / typo / intent (no execution) |
| `memory.ts` | Scoped preferences |
| `learning.ts` | Disclosed engagement signals |
| `discoveryAnalytics.ts` | Admin metrics proxies |

## Policy

- `aiMayReorderFeed: false`
- `aiExecutesSearch: false`
- `autoAct: false`
- Security notifications never overridden
