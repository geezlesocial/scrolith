# Phase 30 — Admin Guide: Scrolith Human Verification

## Where to configure

**Admin Dashboard → Google Settings → Scrolith Human Verification**

(Optional third-party Google reCAPTCHA remains on the same page.)

## Recommended production rollout

1. Ensure Phase 30 migration is applied.
2. Leave Master Enable **off** while verifying admin UI loads.
3. Enable Master Enable.
4. Start with **difficulty = automatic** and core endpoints only (login, signup, support, forgot/reset password).
5. Watch analytics for 24–48 hours.
6. Expand to marketplace/jobs/API only if needed.

## Controls

### Master & emergency

| Control | Purpose |
|---|---|
| Master Enable | Global on/off |
| Emergency Disable | Instantly bypass all challenges without wiping config |

### Endpoints

Toggle verification per surface (login, signup, support, etc.).

### Challenge types

Disable individual types if a locale or UX issue appears.

### Timing

| Field | Guidance |
|---|---|
| Expiration (sec) | 120–300 typical |
| Token TTL | 300–600 for form completion |
| Max attempts | 3–5 |
| Lock duration | 300+ after abuse |

### Behavior

- **Always verify** — show challenge whenever endpoint is enabled
- **Risk-based** — skip low-risk when Always verify is off
- **Progressive difficulty** — escalate after failures
- **Skip logged-in users** — useful for authenticated support forms

### Branding & theme

Customize title, instructions, success/failure messages, accent color, shape, animation.

## Analytics

Dashboard cards:

- Generated / Solved / Failed / Expired
- Success & failure rates
- Average solve time
- Top endpoints, browsers, IPs, countries

## Operational tips

- If users report “storage not ready”, the migration was not applied.
- Emergency Disable is safer than redeploying when under attack investigation.
- Prefer Scrolith Human Verification for privacy; keep Google reCAPTCHA only if contractually required.
