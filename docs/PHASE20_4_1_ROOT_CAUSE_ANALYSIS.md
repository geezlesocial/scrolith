# Phase 20.4.1 — Root Cause Analysis

## Symptom

```
ReferenceError: Cannot access 'p' before initialization
    at Ge (Overview-*.js:…)
```

Global ErrorBoundary on:

- `/freelancer/dashboard`
- `/client/dashboard`
- `/freelancer/dashboard?as=employer`

## Exact source declarations

### File 1: `geezle/src/dashboard/freelancer/Overview.tsx`

**Broken order (PR #76):**

```ts
const loadOverview = React.useCallback(async () => {
  // …
  if (unreadCount + unreadNotifications > 0) { /* … */ }
}, [user?.id, unreadCount, unreadNotifications]); // evaluates unreadNotifications here

// … later in the same function body …
const unreadNotifications = React.useMemo(() => {
  return notifications.reduce(/* … */);
}, [notifications]);
```

### File 2: `geezle/src/dashboard/employer/Overview.tsx`

Identical pattern for employer Overview.

## Mechanism

JavaScript **temporal dead zone (TDZ)** for `const`/`let`:

1. Component function runs top-to-bottom.
2. `React.useCallback(fn, deps)` **evaluates `deps` immediately**.
3. Dependency array reads `unreadNotifications` while the binding is still uninitialized.
4. Runtime throws `ReferenceError: Cannot access '…' before initialization`.
5. Minifier renames `unreadNotifications` → `p` (hence console shows `p`).

This is **not** a React hook rules violation alone — it is language-level TDZ triggered by hook argument evaluation order.

## Why build/dev validation missed it

| Check | Why it failed to catch |
|---|---|
| TypeScript compile | Declaration order is legal for TS type analysis; no error |
| Vite production build | Bundle succeeds; TDZ only fires when the function runs |
| Unit tests (string presence) | Asserted imports/components exist, not declaration order |
| Dev server (if not exercised) | Crash only on authenticated Overview mount |
| Lazy chunk load | Overview is code-split; homepage does not load it |

## Why existing tests missed it

- No render test mounting Overview components
- No static assertion that `unreadNotifications` is declared before `loadOverview`
- Phase 20.4 tests only checked substring presence of workspace widgets

## User impact

- **P0:** Both professional workspaces unusable under p204 (`00140-zaq`)
- Header shell still rendered; main content ErrorBoundary only
- Backend / social feed / growth APIs unaffected

## Fix

Move `const unreadNotifications = React.useMemo(...)` **above** `const loadOverview = React.useCallback(...)` in both Overview files. Preserve all Phase 20.4 UI features.

## Prevention

1. Source-order regression tests (added in 20.4.1)
2. Prefer computing inbox focus in a separate `useMemo` that cannot be pulled into earlier callback deps accidentally
3. Future: ESLint rule for “used before declaration” (`no-use-before-define` with hooks awareness)
