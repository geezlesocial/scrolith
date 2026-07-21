# Phase 28B — Admin Currency Management Layout Hardening & Responsive Controls

**Status:** Implemented (no production deployment)  
**Date:** 2026-07-21  
**Next:** Phase 28C — Currency Management UI Deployment & Production Certification  

---

## Root cause

| Issue | Cause | Location |
|-------|--------|----------|
| Solid blue / right obstruction | **Save All Changes** footer was a **third sibling** in `md:flex-row`, so on desktop it became a vertical column to the right of content. The blue Save button occupied that column and stole horizontal space. | `SystemSettings.tsx` outer shell |
| Table columns clipped | Nested `overflow-hidden` + flex child without `min-w-0` prevented horizontal scroll | Shell + table wrapper |
| Narrow table | Admin main used `max-w-7xl` always; system settings + 256px sub-nav left little room | `AdminDashboard.tsx` |
| Actions/rate inaccessible | No table-level `overflow-x: auto`; table clipped instead of scrolling | Currency table wrapper |

**Not caused by:** FX backend, Frankfurter, gateway config, or monetary APIs.

---

## Layout before → after

### Before

```
[ Admin sidebar | SystemSettings flex-row ]
                  [ nav | content | SAVE COLUMN (blue) ]  ← broken third column
                  table overflow-hidden → clipped
```

### After

```
[ Admin sidebar | SystemSettings flex-col ]
                  [ nav | content (min-w-0) ]   ← row
                  [ full-width Save footer ]   ← never a side column
                  table container overflow-x: auto
                  sticky Code + Actions columns (md+)
                  mobile currency cards (< md)
```

---

## Files changed

| File | Change |
|------|--------|
| `geezle/src/dashboard/admin/SystemSettings.tsx` | Shell restructure; currency toolbar, filters, pagination; scrollable table; sticky cols; mobile cards; tablet nav select |
| `geezle/src/dashboard/AdminDashboard.tsx` | `min-w-0` content column; wider max-width when `activeTab === 'system'` |
| `geezle/src/dashboard/admin/fx/FxControlPlanePanel.tsx` | `min-w-0` / responsive grid for FX cards |

**No backend files. No FX policy / rate / gateway behavior changes.**

---

## Breakpoint behavior

| Width | Behavior |
|-------|----------|
| &lt; 768px | Currency cards; system section via select; toolbar wraps |
| 768–1023px | Scrollable table; system section select (until `lg`) |
| ≥ 1024px | Side system nav + table with sticky first/last columns |
| System tab | Main content max width up to ~100rem |

---

## Controls

- Search (code / name / symbol)
- Status filter (all / active / disabled)
- Rate-source filter
- Refresh, Update Rates, Add Currency (wrap)
- Rate inputs: min-width ~7.5rem, tabular-nums, full value via `title`
- Status toggle, set base, delete (min 40px hit targets)
- Pagination: first/prev/next/last, page size, result count

---

## Sticky columns

- **Code** sticky left, solid white/gray background  
- **Actions** sticky right  
- Enabled from `md` breakpoint only  

---

## Accessibility

- Table region labeled for horizontal scroll  
- Search / filters labeled  
- Base toggle and delete have `aria-label`  
- Focusable scroll region (`tabIndex={0}`)  
- Mobile cards use semantic `<article>`  

---

## Regression (behavior)

Unchanged:

- Base currency rules  
- Rate update / auto FX sync handlers  
- Snapshot / override / lock FX panel  
- Preferred currency (user)  
- Gateways / wallet / historical amounts  

---

## Phase 28C deployment plan

1. Build frontend image with Phase 28B commit  
2. Deploy tagged `p28b` at 0% traffic  
3. Visual cert at 1024 / 1280 / 1440  
4. Confirm no FX/API regression  
5. Promote 100%  
6. Monitor admin UX only  

**No automatic deploy in Phase 28B.**

---

## Completion gate

See `geezle/playwright-results/phase28b/completion-gate.json`.
