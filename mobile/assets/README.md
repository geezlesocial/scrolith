# Mobile Branding Assets

Put your final branding files in this folder, then run:

```bash
cd mobile
npx @capacitor/assets generate --android --iconBackgroundColor "#0b1020" --splashBackgroundColor "#0b1020"
```

## Easy Mode (recommended)

Provide a single logo file:

- `logo.png` (or `icon.png`)
  - At least 1024x1024
  - Transparent background recommended

The generator will create:
- Android launcher icons (including adaptive icon layers)
- Splash screens (including dark mode variants)

Notes:
- Do not commit keystores to git.
- Android build artifacts are ignored by `mobile/android/.gitignore`.
