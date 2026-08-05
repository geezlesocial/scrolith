# Scrolith Android Production 1.1.59

This release fixes the Android-only Scrolith Human Verification network error while preserving the working web mobile and desktop behavior.

## Google Play Release Notes

This update improves Scrolith Human Verification reliability on Android by adding a native secure network fallback for verification challenge creation and verification. It keeps sign-in and signup protected across the mobile app, web mobile, and desktop, and improves production app stability without changing existing account, messaging, marketplace, or feed behavior.

## Production Details

- Version name: 1.1.59
- Version code: 69
- Production app: https://scrolith.com
- Production API: https://api.scrolith.com
- Backend: unchanged
- Google Play upload: not performed

## Validation Scope

- Android Human Verification challenge creation
- Android Human Verification answer verification
- Web mobile and desktop Human Verification behavior preserved
- Production API endpoint targeting
- Production release bundle generation
