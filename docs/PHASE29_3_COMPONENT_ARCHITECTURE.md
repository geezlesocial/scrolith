# Phase 29.3 — Component Architecture

```
Messages.tsx
├── Conversation list (existing)
├── Thread (existing message renderer / SmartComposer)
│   ├── group-pins-banner
│   ├── group-composer-restriction
│   └── multi-typer indicator (presenceIndicatorLabel)
├── GroupCreateWizard (new)
└── GroupManagePanel (enhanced tabs)
    ├── General / Members / Invites
    ├── Join requests / Modes / Danger
```

## New modules

| Module | Role |
|--------|------|
| `GroupCreateWizard.tsx` | 6-step creation |
| `groupMessagingUx.ts` | Pure labels + restriction resolver |
| `messaging.ts` APIs | Enterprise HTTP client |

## Data flow

```
Wizard → createEnterpriseGroup → navigate /messages/:id → open GroupManagePanel
Active group → getEnterpriseGroup + listGroupPins → restriction + pins UI
Socket typing → formatMultiTyperLabel → header/thread indicator
Socket group:join → authorized room (29.2)
```

## DM isolation

- Wizard / panels only for `isActiveGroupConversation`  
- `createConversation` without type remains DM  
- Restriction resolver returns non-blocked for `isGroup: false`  
