# Android Wrapper Certification (Phase 21.1.6)

## Goal

Validate the Capacitor WebView against the same design-system contracts as mobile web **without requiring a physical device during automation development**.

## Prep script

```powershell
cd C:\Projects\geezle
npm run test:cert:android-prep

# With device + open cert URL:
$env:SCROLITH_REQUIRE_ADB="1"
$env:CERT_OPEN_ANDROID="1"
npm run test:cert:android-prep
```

Output: `playwright-results/phase2116/android-prep.json`

## Emulation proxy (no device)

Playwright projects `pixel-7`, `iphone-15`, and `mobile-390` cover spacing, touch targets, coach, survey, and overflow.

```powershell
npx playwright test -c tests/certification/playwright.config.ts --project=pixel-7 --project=mobile-390
```

## Physical device checklist

| Check | Notes | Pass |
|-------|-------|------|
| Open staged URL or production app build | Same asset hash as cert revision | ☐ |
| WebView font scaling (system large text) | Titles truncate, no overlap | ☐ |
| Safe area (notch / gesture bar) | Header and action row usable | ☐ |
| Touch targets | Survey ≥42px, actions ≥44px | ☐ |
| AI Coach | CTA right, no overflow | ☐ |
| Media | Portrait/landscape/square no jump | ☐ |
| Feed scroll + 60s identity | Visible post id stable | ☐ |
| Offline banner / reconnect | No card identity swap | ☐ |

## Package / WebView tips

- Prefer `useHybridComposition` / system WebView updates on older Android.
- Capture `chrome://inspect` remote debug screenshots on failure.
- Align Capacitor `server.url` only for local debug — production uses bundled or CDN assets per release process.

## Relation to promotion

Android physical residual may be **risk-accepted** for a pure CSS/layout FE release if:

1. Playwright mobile projects pass  
2. Mobile Chrome on real phone passes  
3. No WebView-specific CSS is introduced  

Document acceptance in the release gate notes.
