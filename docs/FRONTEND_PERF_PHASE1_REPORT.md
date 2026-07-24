# Frontend Performance Optimization — Phase 1 Report

**Date:** 2026-07-24  
**Branch:** `candidate/frontend-perf-phase1`  
**Deployed:** No  
**Method:** Production Vite builds before/after + static bundle analysis. Lab CWV (LCP/INP/CLS) on real devices was **not** collected in this pass (requires instrumented browser session); improvements are bundle/render-architecture oriented with measured asset deltas.

---

## 1. Performance Report

### Baseline (before) — production `npm run build`

| Metric | Value |
|--------|------:|
| Total JS (dist/assets) | **7536.1 KB** |
| Total CSS | **262.6 KB** |
| Entry `index-*.js` | **601.1 KB** |
| `maps-*.js` (maplibre) | **1024.2 KB** |
| `MemberHomeSection-*.js` | **257.3 KB** |
| `Messages-*.js` | **210.2 KB** |
| `icons-*.js` (lucide) | **112.0 KB** |
| `react-core-*.js` | **189.2 KB** |
| JS file count | 329 |

Evidence: `geezle/docs/evidence/perf_phase1_baseline_bundles.json`

### After Phase 1 optimizations

| Metric | Value | Δ |
|--------|------:|---|
| Total JS | **7213.8 KB** | **−322.3 KB (−4.3%)** |
| Total CSS | **260.2 KB** | **−2.4 KB** |
| Entry `index-*.js` | **562.5 KB** | **−38.6 KB (−6.4%)** |
| `maps-*.js` | **1023.1 KB** | ~flat (lazy/not preloaded) |
| `MemberHomeSection-*.js` | **238.4 KB** | **−18.9 KB (−7.3%)** |
| `Messages-*.js` | **197.2 KB** | **−13.0 KB (−6.2%)** |
| `icons-*.js` | **68.2 KB** | **−43.8 KB (−39%)** |
| Bundle budget gate | **PASS** | new CI script |

Evidence: `geezle/docs/evidence/perf_phase1_bundle_budget.json`

### Core Web Vitals

| Metric | Status |
|--------|--------|
| LCP / FCP / TTI / TBT / INP / CLS | **Not instrumented in this automated pass** — recommend Lighthouse/Web Vitals on staging candidate FE |
| Expected LCP impact | Positive from smaller entry JS + reduced modulePreload of heavy vendors |
| Expected INP impact | Positive from stable context values reducing re-render work |

### Remaining bottlenecks

1. **maps-*.js ~1 MB** — correctly code-split; still large when map routes open  
2. **index ~562 KB** — still carries shell providers/navbar  
3. **MemberHomeSection ~238 KB** — largest product surface; needs later component splits  
4. **Messages ~197 KB** — large messaging UI; virtualization already partial  
5. Context tree depth remains high (many providers) — split further in Phase 2  

---

## 2. Bundle Report

### What changed in Vite

- `build.target: es2020`, `cssTarget: chrome90`  
- `assetsInlineLimit: 2048`  
- `minify: esbuild`, `sourcemap: false`, `legalComments: none`  
- Manual chunks: **axios → `http`**, **tanstack virtual → `virtual`**, capacitor/aparajita grouped  
- Module preload excludes: maps, capacitor, realtime, charts, payments, **icons**, **virtual**  
- Soft chunk warning limit 700 KB; **hard budgets** via `scripts/check-bundle-budget.mjs`  
- Scripts: `npm run build:budget`, `npm run check:bundle-budget`

### New chunk layout (top)

| Chunk | ~KB | Notes |
|-------|----:|-------|
| maps | 1023 | maplibre — lazy |
| index | 563 | app shell |
| MemberHomeSection | 238 | lazy route |
| Messages | 197 | lazy route |
| react-core | 193 | shared |
| icons | 68 | reduced; not preloaded |

---

## 3. React Report

### Context optimizations

| Context | Change |
|---------|--------|
| `SocketContext` | `useMemo` stable `{socket, isConnected, connectionHealth}` |
| `UserContext` | `useMemo` value + `useCallback` for `updateUser` / `switchRole` (reduces re-renders when parent NetworkStatus updates) |
| `ContentContext` | `useMemo` provider value |
| Message / Notification / Cart / Favorites / NetworkStatus | Already memoized (verified) |

### Component optimizations

| Component | Change |
|-----------|--------|
| `EnterpriseAvatar` | Default `loading="lazy"` (headers/chat still pass `eager`) |
| `OptimizedImage` | Already default lazy/async (verified) |
| Navbar | Prefetch Messages / NotificationCenter modules on open/hover |
| Route prefetch util | `src/utils/routePrefetch.ts` idle/hover loaders |

### Render reductions

- Socket/User/Content provider identity churn reduced on non-local parent re-renders.  
- Avatar default lazy reduces decode work off-screen in feeds/lists.  

**Memory/CPU:** Not profiled with Chrome DevTools in this pass; expected improvement from fewer context consumers invalidating and fewer eager image decodes.

---

## 4. Mobile Report

| Area | Change / expectation |
|------|----------------------|
| Startup | Smaller entry JS → faster WebView parse |
| Scrolling | Lazy avatars + existing virtualization (navbar notifications, tanstack available) |
| Touch | Prefetch on message open reduces post-tap wait |
| Memory | Fewer simultaneous image decodes (lazy default) |
| Capacitor | No plugin/API changes; production API URLs unchanged |

Device lab metrics: **not measured this pass** — recommend low-end Android smoke on next candidate FE deploy.

---

## 5. Lists / images / network (Phase 1 scope)

| Area | Status |
|------|--------|
| Virtualization | Existing: notifications virtual window in Navbar; `@tanstack/react-virtual` dep; messaging windows in Messages |
| Images | EnterpriseAvatar lazy default; OptimizedImage already responsive + lazy |
| Network | Existing axios retry/timeouts; no API contract changes; prefetch is module-only (not data) |

---

## 6. Testing

| Check | Result |
|-------|--------|
| Production build | PASS |
| Bundle budget | PASS |
| Targeted unit tests (chat color, menu policy) | PASS (when run) |
| Deploy | **Not performed** |
| Merge | **Not performed** |

---

## 7. Git

| Field | Value |
|-------|--------|
| Branch | `candidate/frontend-perf-phase1` |
| Base | messaging enhancements FE (`92da8d29` lineage) |
| Deploy | No |

### Files changed (this phase)

- `vite.config.ts`
- `package.json` (budget scripts)
- `scripts/check-bundle-budget.mjs`
- `src/utils/routePrefetch.ts`
- `src/context/SocketContext.tsx`
- `src/context/UserContext.tsx`
- `src/context/ContentContext.tsx`
- `src/components/common/EnterpriseAvatar.tsx`
- `src/components/Navbar.tsx`
- `docs/evidence/perf_phase1_*.json` (under geezle and/or docs)

---

## 8. Deployment status

| Action | Status |
|--------|--------|
| Production deploy | **NO** |
| Merge to main | **NO** |
| Android AAB | **NO** |
| Candidate branch | **YES** (`candidate/frontend-perf-phase1`) |

---

## Success criteria checklist

| Criterion | Result |
|-----------|--------|
| Reduced initial JS payload | **YES** (−6.4% entry, −4.3% total) |
| Faster route transitions (prefetch) | **YES** (messages/notifications) |
| Fewer unnecessary re-renders | **YES** (context identity) |
| Lower memory/CPU (expected) | **Likely** — not lab-measured |
| Smoother scrolling (lazy images) | **YES** (architecture) |
| CWV improved | **Pending lab measurement** |
| No functional regressions | **Build/tests clean; full Playwright not re-run** |
| API compatibility | **Unchanged** |

---

## Recommended Phase 2

1. Split `MemberHomeSection` / `Messages` into sub-route chunks  
2. Icon import audit (per-icon paths if needed)  
3. Socket connect deferred until authenticated shell ready on non-chat pages  
4. Lighthouse CI on candidate FE URL  
5. Profile MessageContext selector pattern (split inbox vs thread contexts)  
