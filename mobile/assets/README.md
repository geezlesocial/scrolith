# Mobile Branding Assets

Put your final branding files in this folder, then run:

```bash
cd mobile
npx @capacitor/assets generate --android
```

Recommended source files (PNG):

- `icon.png`
  - 1024x1024
  - Transparent background (preferred)
- `splash.png`
  - 2732x2732 (or any large square image; the generator will resize/crop)
  - Background baked-in (or use the generator flags for background color)

Notes:
- Do not commit keystores to git.
- Android build artifacts are ignored by `mobile/android/.gitignore`.

