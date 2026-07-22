# Phase 32.1 — Notification Center UI

## Routes

| Route | Experience |
|-------|------------|
| `/notifications` | Full Notification Center (protected) |
| `/m/notifications` | Mobile shell list (existing) + **Full inbox** CTA |
| Navbar bell | Existing dropdown + **Open Notification Center** |

## Layout

1. **Header** — title, refresh, mark all read  
2. **Counters** — unread, total, critical, high, pinned, archived  
3. **Category rail** — All + taxonomy categories with unread chips  
4. **Main pane**  
   - Search  
   - Quick filters (unread/read/pinned/critical/high/archived/today/week/older)  
   - Bulk action bar when items selected  
   - Virtual-feel infinite scroll list  

## Notification card

- Checkbox (bulk select)  
- Unread dot  
- Actor avatar / monogram  
- Pin badge  
- Category + priority chips  
- Title, body (2-line clamp), actor, relative time  
- Click → deep link + mark read  

## Accessibility

- Landmark labels (`aria-label` on list/counters/toolbar)  
- Keyboard-focusable cards (`focus-visible:ring`)  
- Screen-reader labels for search clear / select  
- Loading skeletons with `aria-busy`  
- Reduced visual noise for silent priority  

## Realtime

- Socket `notifications:new` reloads page + context refresh  
- Badge updates via existing NotificationContext + summary reload  

## Design system

Tailwind utility patterns consistent with Scrolith admin/member surfaces (slate/blue, rounded-2xl cards, soft borders).
