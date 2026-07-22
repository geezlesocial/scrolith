# Phase 33.2 — Recommendation Engine

## Position in Scrolitha

Extends Phases 33.0–33.1. All model calls use `ScrolithaAI.execute()`. No second gateway.

## Algorithms (advisory)

| Signal | Source |
|--------|--------|
| Interest match | `AIUserMemory.preferredTopics` + learning weights |
| Mute / hide | `mutedTopics`, `mutedEntityIds` |
| Entity affinity | Disclosed signal weights by type |
| Freshness / engagement | Heuristic on candidate metadata |

## Output contract

```json
{
  "entityType": "job",
  "score": 0.76,
  "explanation": "Recommended because you follow topics related to react.",
  "whyAmISeeingThis": "...",
  "reasons": ["Interest: react"],
  "advisoryOnly": true
}
```

## Policy

- `autoAct: false` — never auto-follow, join, apply, purchase  
- Deterministic product ranking remains free to ignore scores  
- Feature flag: `recommendationsEnabled` (default OFF)  
