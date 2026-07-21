# Phase 29.3 — Enterprise Messaging Groups Frontend & UX

| Field | Value |
|-------|--------|
| **Phase** | 29.3 |
| **Status** | Implementation complete (**not deployed**) |
| **Date** | 2026-07-21 |
| **Scope** | Frontend only — consumes Phase 29.1 APIs + Phase 29.2 sockets |
| **Deploy** | **Forbidden** |

---

## Objective

World-class **Messaging Groups** UX inside the existing Scrolith **Messages** experience — not Community Groups, not a parallel product. DMs unchanged.

---

## Delivered surfaces

### 1. Group Create Wizard (`GroupCreateWizard.tsx`)

Six steps: Identity → Privacy → Joining → Permissions → Content → Review.  
Submit: `POST /api/messages/groups` via `MessagingService.createEnterpriseGroup`.  
SECRET forces invite-only with clear copy.

### 2. Group manage panel (enhanced)

Tabs: General, Members, Invites, Join requests, Modes, Danger.  
Invites: generate / one-time / copy.  
Modes: messaging mode + slow mode.  
Danger: lock / unlock.

### 3. Messages workspace integration

- Wizard replaces bare title/ids dialog  
- Multi-typer labels (`formatMultiTyperLabel`) from Phase 29.2 `typing[]`  
- Multi-recorder labels  
- Composer restriction banner (locked / announcement / slow mode / media disabled)  
- Pins banner  
- Socket `messages:group:join` / leave when opening a group  
- Enterprise profile load (`getEnterpriseGroup`) for modes/permissions  

### 4. Service layer

Extended `MessagingService` with enterprise group, pins, catch-up, join-request, lock APIs — fall back to Phase 22.2 invite path when needed.

---

## Reuse

| Existing | Usage |
|----------|--------|
| Messages.tsx | Shell, list, thread, send |
| SmartComposer | Composer |
| GroupManagePanel | Members (expanded) |
| MessagingService | HTTP |
| Socket `/community` | Typing + group join |
| Mentions, reactions, attachments, Scrolitha | Unchanged paths |

---

## Security / privacy UX

- Admin tabs hide when `canManage` false  
- SECRET explained; no discovery UI  
- Invite code only shown to creator after generate (not via socket)  
- Composer blocks when mode/permissions deny send  

---

## Performance

- Virtualized conversation list unchanged  
- Group profile fetch only when active group  
- Lazy wizard mount when open  

---

## Accessibility

- Wizard dialog `role="dialog"` / `aria-modal`  
- Tabs `role="tablist"` / `aria-selected`  
- Typing indicator `aria-live="polite"`  
- Restriction banner `role="status"`  

---

## Explicit non-goals (later)

- Full Scrolitha group-summary backend (placeholder entry via existing Scrolitha DM)  
- Native QR canvas render (join path documented for QR consumers)  
- Phase 29.4 admin dashboard  

---

## Rollback

Revert FE commit. No DB changes. DMs and Phase 22.2 create path remain in service layer.
