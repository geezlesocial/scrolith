# Phase 20.2 — Secure KYC Foundation

## Summary

Implements private KYC document handling, malware quarantine (ClamAV sidecar protocol), magic-byte validation, EXIF stripping, consent capture, fine-grained permissions, secure document viewing, KYC audit events, and verification-status consistency.

## Non-goals (explicitly NOT implemented)

- OCR / MRZ / barcode / document classification
- Face comparison, liveness, biometric templates
- Automated final approval or permanent auto-rejection
- Sanctions / PEP screening
- Final retention durations (legal approval pending)

## Storage

- Preferred: `KYC_GCS_BUCKET` dedicated private bucket
- Temporary: private prefix `kyc/quarantine|clean|rejected/` on media GCS bucket
- Local dev: `uploads/kyc-private/`
- No public ACLs; no permanent public URLs; randomized object keys only

## Upload path

`POST /api/kyc/uploads` (authenticated, rate-limited)

Pipeline: validate → quarantine → ClamAV scan → normalize images → promote clean → return document id (no URL).

## Decision path

`POST /api/admin/kyc/:id/status` with mandatory reason.

Only authorized admins; generic `PUT /api/admin/users/:id` cannot mutate `kycStatus` / `isVerified`.

## Permissions

Fine-grained keys under `kyc.*` (case.read, document.view, decision.*, config.*, audit.read, export, delete). Legacy `kyc.read` / `kyc.review` remain for compatibility.

## Environment

| Variable | Purpose |
|----------|---------|
| `KYC_GCS_BUCKET` | Dedicated private KYC bucket (preferred) |
| `CLAMAV_HOST` / `CLAMAV_PORT` | clamd TCP endpoint |
| `CLAMAV_MODE` | `tcp` (default), `mock_clean`, `mock_infected`, `disabled` (fail closed) |
| `CLAMAV_TIMEOUT_MS` | Scan timeout |

## Rollback

Never roll back to public KYC uploads. If application rollback is required, disable new KYC uploads and keep private storage + audit tables.

## Pending legal decisions

- Retention durations per status
- Data residency
- Biometric policy (deferred)
- DSAR export format
