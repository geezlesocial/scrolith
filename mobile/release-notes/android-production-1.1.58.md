# Scrolith Android Production 1.1.58

This release improves Scrolith sign-in and account creation reliability across Android, web mobile, and desktop.

## Google Play Release Notes

This release expands Scrolith Human Verification across sign-in and signup surfaces, including guest homepage authentication and popup auth forms. It also improves verification retry behavior on mobile networks and keeps the Android app aligned with the latest Azure production frontend.

## Production Details

- Version name: 1.1.58
- Version code: 68
- Production app: https://scrolith.com
- Production API: https://api.scrolith.com
- Frontend revision: ca-scrolith-frontend--hv-d61aeb4e
- Backend: unchanged
- Google Play upload: not performed

## Validation Scope

- Human verification on full login page
- Human verification on full signup page
- Human verification on guest homepage login/signup card
- Human verification on popup login/signup flows
- Mobile WebView origin support through `https://localhost`
- Production endpoint validation for `https://scrolith.com` and `https://api.scrolith.com`
