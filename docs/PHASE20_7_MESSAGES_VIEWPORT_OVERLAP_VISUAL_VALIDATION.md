# Phase 20.7 Messages Viewport — Visual Validation

## Production evidence (automated)

| Check | Result |
|---|---|
| FE revision 100% | `scrolith-frontend-00151-fin` p2072 |
| /messages HTTP 200 | **YES** |
| Messages chunk markers | history/composer data-testid strings present when loaded |

## Operator visual checklist (required for full cert)

Hard-refresh production, desktop ≤900px height and standard heights:

1. Open Scrolitha conversation  
2. Confirm ≥3–5 message rows visible without scrolling when history is short  
3. Confirm last bubble not under composer  
4. Confirm first bubble not under header  
5. Confirm chips single horizontal row  
6. Confirm composer compact (~1 line)  
7. Type multi-line text → grows then internal scroll  
8. Human DM layout still compact  
9. No floating dock on `/messages`  
