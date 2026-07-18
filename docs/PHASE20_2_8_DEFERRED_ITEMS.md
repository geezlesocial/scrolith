# Phase 20.2.8 — Remaining Deferred Items

These items were explicitly reviewed and **must not be treated as unfinished 20.2.8 work**. Each has a technical or product justification.

## Product / architecture deferrals

1. **Connection requests** — LinkedIn-style graph would dual-track social relationships against the existing follow graph.  
2. **Skill endorsements** — Requires schema, spam controls, and ranking.  
3. **Written recommendation letters** — New lifecycle entity; marketplace reviews partially cover trust.  
4. **Reddit flair / karma** — New community reputation model.  
5. **Workspace channels / bots (Slack-class)** — Partial rooms exist; full matrix is multi-quarter.  
6. **Group video / TURN infrastructure** — Infra investment + product QA.  
7. **Longform block editor (TipTap-class)** — RichText exists; full editor is multi-sprint.  
8. **Newsletters** — Email product + compliance.  
9. **Realtime collaborative documents (CRDT)** — Not core moat.  
10. **Notion / Canva / GitHub hosting** — Different product categories (N/A).  
11. **Multi-stage ATS redesign** — Pipeline exists; redesign is product-led.  
12. **Full Meta-grade creator studio** — Needs richer aggregates beyond current insights APIs.  
13. **Feed list virtualization** — Dependency + Member Home regression risk.  
14. **User appeals transparency portal** — Models exist; full portal is larger UX program.  
15. **Helmet CSP production allowlist rewrite** — Can break share preview/admin HTML without careful QA.  
16. **Changing `/api/health` to non-200 when degraded** — Would break existing always-200 probes; use `/api/readyz` instead.  
17. **Platform-wide alert/confirm replacement** — Many call sites; needs design-system dialogs.  
18. **OpenTelemetry / full APM** — Architecture expansion.  
19. **BE-wide strip of all `error?.message` leaks** — Staged module cleanup; posts.options done in 20.2.8.  
20. **Google Play upload of AAB 1.1.18** — Explicit human authorization required.  
21. **Physical device lab certification** — Hardware-dependent.  
22. **Phase 20.3.1 KYC quality program** — Separate authorized phase after 20.3.1A readiness.

## Acceptable residual ops notes

- Readyz returns **503** during cold-start Prisma connect — correct for readiness, not liveness.  
- PYMK quality depends on reco data volume.  
- Authenticated end-to-end product smoke should be repeated with a staff account periodically.
