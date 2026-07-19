# Device Checklist — Phase 21.1.6

## Automated (Playwright projects)

| Project | Viewport / device | Suite |
|---------|-------------------|-------|
| `desktop-chrome` | 1440×900 | Full auth specs |
| `pixel-7` | Pixel 7 | mobile-emulation + shared specs |
| `iphone-15` | iPhone 15 | mobile-emulation + shared specs |
| `mobile-390` | 390×844 | Gate default mobile |

```powershell
npx playwright test -c tests/certification/playwright.config.ts --project=pixel-7
npx playwright test -c tests/certification/playwright.config.ts --project=iphone-15
npx playwright test -c tests/certification/playwright.config.ts --project=mobile-390
```

## Manual residual (Android wrapper)

Use [android-wrapper-cert.md](./android-wrapper-cert.md).

| Item | Pass |
|------|------|
| Typography matches mobile web | ☐ |
| 16px card padding | ☐ |
| Follow / More stable | ☐ |
| Action row equal columns | ☐ |
| AI Coach no overflow | ☐ |
| Survey equal buttons | ☐ |
| Media no layout jump | ☐ |
| 60s feed identity | ☐ |
| Dark mode readable | ☐ |
| Safe-area / notches | ☐ |

## Visual scenarios (all form factors)

| Scenario | Pass |
|----------|------|
| Long username truncate | ☐ |
| Long body 5-line clamp + More/Less | ☐ |
| AI Coach min-height | ☐ |
| Chips wrap (2/5/10) | ☐ |
| Survey equal buttons | ☐ |
| Translation row | ☐ |
| Portrait / landscape / square / video / none | ☐ |
