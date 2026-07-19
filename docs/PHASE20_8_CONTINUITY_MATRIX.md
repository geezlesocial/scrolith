# Phase 20.8 — Continuity Matrix

**Baseline:** FE `scrolith-frontend-00167-wal` (p2080), BE `scrolith-backend-00138-zan` (p2079)

| Feature | Source | API | Change | Backend |
|---|---|---|---|---|
| Text send | Messages.tsx | POST messages | UI only | Unchanged |
| Attachments | uploadMessageFiles | /files/upload | Plus launcher | Unchanged |
| Files / Media / Camera inputs | hidden file inputs | same | Behind + | Unchanged |
| Voice notes | VoiceRecorder | voice-notes | Slot on SmartComposer | Unchanged |
| Suggest Reply | handleAiSuggest | scrolitha rewrite | Secondary control | Unchanged |
| Staging previews | pendingAttachments | — | Horizontal strip | Unchanged |
| Scrolitha chips | scrolithaPromptChips | ensure | Above composer | Unchanged |
| Dock composer | InlineMessageComposer | same | SmartComposer compact | Unchanged |
| Search / unread / sockets | existing | existing | No change | Unchanged |
| Scrolitha menu | ScrolithaConversationMenu | 20.7.8 | No change | Unchanged |

**Root UX problems:** permanent Files/Media/Camera buttons overcrowded toolbar; tall multi-row controls; low discoverability of primary send.
