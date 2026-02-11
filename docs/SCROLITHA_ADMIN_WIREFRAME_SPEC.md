# Scrolitha Admin UI Wireframe Spec (Figma-Ready)

## Page Location
- `Admin Dashboard -> Intelligence -> Scrolitha`
- Desktop min width: `1280`
- Mobile fallback: stacked tabs with full-width cards

## Global Layout
- Frame: `1440 x 1024`
- Main grid: `12 columns`, gutter `24`, margins `32`
- Header row:
  - Title: `Scrolitha`
  - Subtitle: `Assistant Console, Skills, Policies, Audit, Analytics`
  - Status chips: `Socket Connected`, `Fallback Polling` (if disconnected)

## Top Navigation Tabs
- Tabs (left to right):
  1. `Console`
  2. `Skills Library`
  3. `Policies & Security`
  4. `Audit Logs`
  5. `Analytics`
- Tab style:
  - Active: solid dark background + white text
  - Inactive: bordered neutral background

## Tab 1: Console

### Left Panel (8 columns)
- Component: `ChatInputCard`
  - Multi-line input (`message`)
  - Primary button `Send`
  - Placeholder: `e.g. Approve monetization application app_123`
- Component: `AssistantReplyCard`
  - Text block for assistant reply
- Component: `ActionPreviewList`
  - Repeating `ActionPreviewItem`
    - `actionKey`
    - `summary`
    - `toolKey` + `method` + `endpoint`
    - `params JSON editor`
    - `Execute` button
    - `requires confirmation` badge

### Right Panel (4 columns)
- Component: `ConsoleMetaCard`
  - Current conversation ID
  - Last action timestamp
  - Recent completion event summary

## Tab 2: Skills Library

### Toolbar
- Inputs: `key`, `name`, `roleScope(csv)`, `description`
- Action: `Add Skill`

### Skills Table/Card List
- Columns/fields:
  - `key`
  - `name`
  - `version`
  - `roleScope`
  - `isActive`
  - `updatedAt`
- Row actions:
  - `Enable/Disable`
  - `Delete`

## Tab 3: Policies & Security

### Scope Switch
- Segmented control: `admin` / `user`

### Controls
- Toggles:
  - `Enabled`
  - `Safe mode`
  - `Confirm by default`
  - `Auto-execute low risk`
- Inputs:
  - `Deny-listed tools` (CSV)
  - `Prompt blocklist` (CSV)
  - `User rate limit / min`
  - `Admin destructive cap / min`
- Primary action:
  - `Save Policies`

## Tab 4: Audit Logs

### Filters
- Optional filters:
  - `actorId`
  - `scope`
  - `eventType`

### Log Stream
- Each row shows:
  - `eventType`
  - `toolKey`
  - `resultStatus`
  - `actorId + actorRole`
  - `createdAt`
  - `resultSummary`
- Pagination:
  - `Load More` button (`cursor`)

## Tab 5: Analytics

### KPI Cards
- `Conversations`
- `Actions`
- `Failure Rate`
- `Avg Rating`
- `Feedback Count`
- `Estimated Minutes Saved`

### Secondary Views
- `Top Tools` list
- `Task Breakdown` map/table

## Component Inventory
- `ScrolithaManagement`
- `TabNav`
- `ChatInputCard`
- `ActionPreviewItem`
- `PolicyForm`
- `SkillRow`
- `AuditLogRow`
- `KpiCard`

## Interaction Rules
- Sensitive action execution requires explicit confirmation in action execution payload.
- Socket events trigger immediate refresh:
  - `scrolitha:config_updated`
  - `scrolitha:skills_updated`
  - `scrolitha:action_completed`
- Fallback polling interval: `60s` when socket disconnected.

## Accessibility
- All inputs/buttons keyboard reachable.
- Minimum contrast ratio: `4.5:1`.
- Focus ring visible on action buttons and tab controls.

## Responsive Rules
- `< 1024px`: tab bar wraps, panels stack in one column.
- `< 768px`: table views collapse to cards, sticky action buttons removed.
