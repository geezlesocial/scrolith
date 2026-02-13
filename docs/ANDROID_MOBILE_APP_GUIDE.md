# Scrolith Android App (Capacitor) Build + Release Guide

This repository ships the Android app as a Capacitor native shell (`mobile/`) that bundles the web app build output (`geezle/dist`).

## 1) Prerequisites (one-time)

Install:
- Node.js 20+
- Android Studio (includes Android SDK / Platform Tools)
- JDK 17 (required by Android Gradle Plugin 8+)

Recommended:
- A real Android device + USB debugging enabled

## 2) Local Setup

Install dependencies:

```powershell
cd C:\Projects\geezle
npm ci

cd C:\Projects\mobile
npm ci
```

## 3) Build Web Assets For Android (bundled)

Set production build env vars for the web build:

```powershell
$env:VITE_API_URL="https://api.scrolith.com/api"
$env:VITE_BACKEND_URL="https://api.scrolith.com"          # optional (web supports both)
$env:VITE_PUBLIC_APP_DOMAIN="scrolith.com"                # used for deep-link host allowlist

cd C:\Projects\geezle
npm run build
```

Sync into Android:

```powershell
cd C:\Projects\mobile
npx cap sync android
```

Open Android Studio:

```powershell
cd C:\Projects\mobile
npx cap open android
```

## 4) Fast Dev (Live Reload In WebView)

1. Start the web app dev server:

```powershell
cd C:\Projects\geezle
npm run dev
```

2. Point Capacitor to your dev server:

Emulator:

```powershell
$env:CAP_SERVER_URL="http://10.0.2.2:3000"
cd C:\Projects\mobile
npx cap sync android
```

Physical device (replace with your PC LAN IP):

```powershell
$env:CAP_SERVER_URL="http://192.168.1.50:3000"
cd C:\Projects\mobile
npx cap sync android
```

3. Run from Android Studio.

Notes:
- Debug builds allow cleartext HTTP for local development hosts.
- Release builds disable cleartext by default.

## 5) Icons / Splash

1. Put your source images in `mobile/assets/`:
- `mobile/assets/logo.png` (at least 1024x1024, transparent background recommended)

2. Generate Android assets:

```powershell
cd C:\Projects\mobile
npx @capacitor/assets generate --android --iconBackgroundColor "#0b1020" --splashBackgroundColor "#0b1020"
```

Then re-sync:

```powershell
npx cap sync android
```

## 6) Release Signing (required for Play Store)

Generate a keystore (example):

```powershell
keytool -genkeypair -v `
  -keystore scrolith-release.keystore `
  -alias scrolith `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```

Create `mobile/android/key.properties` (do not commit this file):

```properties
storeFile=scrolith-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=scrolith
keyPassword=YOUR_KEY_PASSWORD
```

`mobile/android/app/build.gradle` is already wired to use `key.properties` if present.

## 7) Build AAB / APK

From Windows PowerShell:

```powershell
cd C:\Projects\mobile\android
.\gradlew.bat bundleRelease
```

Output:
- `mobile/android/app/build/outputs/bundle/release/app-release.aab`

For an installable APK (internal testing):

```powershell
cd C:\Projects\mobile\android
.\gradlew.bat assembleRelease
```

Output:
- `mobile/android/app/build/outputs/apk/release/app-release.apk`

## 8) Publish To Google Play

1. Create an app in Play Console.
2. Upload the `app-release.aab` to:
   - Internal testing (recommended first), then Closed testing, then Production.
3. Enable Play App Signing (recommended).
4. Fill store listing, screenshots, content rating, privacy policy, etc.

## 9) Firebase / Push Notifications (important)

Push notifications require `mobile/android/app/google-services.json` to match the final Android `applicationId`.

Current package:
- `com.scrolith.app`

If you change the package name later, you must:
1. Add a new Android app in Firebase Console for the new package name.
2. Download a fresh `google-services.json`.
3. Replace `mobile/android/app/google-services.json`.

## 10) Deep Links (optional but recommended)

Android App Links will only verify if `scrolith.com` hosts:
- `/.well-known/assetlinks.json`

This is optional (custom scheme `scrolith://...` will still work), but verified App Links provide a better UX.
