# Phase 29.3 — UI Specification (summary)

## Wizard

| Step | Fields |
|------|--------|
| 1 Identity | Avatar emoji, accent, name*, description, category, language, country, timezone, members |
| 2 Privacy | Public / Private / Secret cards with help text |
| 3 Joining | Open / Request / Invite only; expiry; max uses |
| 4 Permissions | Messaging mode select + role matrix help |
| 5 Content | Toggles for media/types |
| 6 Review | Summary + Create |

## Group chrome

- Title from group name; member online count in header  
- Manage opens tabbed panel  
- Pins amber banner above composer  

## Composer

| Condition | Banner | Send |
|-----------|--------|------|
| LOCKED | Group is locked | Disabled |
| ANNOUNCEMENT + !canSend | Only admins… | Disabled |
| Images disabled | Images disabled… | Enabled (hint) |
| Slow mode ack | Wait N seconds | Disabled |

## Multi-typer

| Count | Label |
|-------|--------|
| 1 | {Name} is typing… |
| 2 | {A} and {B} are typing… |
| 3+ | {N} people are typing… |

## Responsive

- Wizard full-sheet on mobile, centered card desktop  
- Panel max-w-md slide-over  
- Existing Messages responsive layout preserved  
