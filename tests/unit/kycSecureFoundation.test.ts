/**
 * Phase 20.2R — frontend source contracts for secure KYC foundation.
 * Guards against regressions that reintroduce public media upload or skip consent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const kycService = () => read('src/services/kyc.ts');
const userKyc = () => read('src/dashboard/shared/KYCVerification.tsx');
const adminKyc = () => read('src/dashboard/admin/KYCVerification.tsx');

test('uses secure KYC upload endpoint /kyc/uploads', () => {
  const src = kycService();
  assert.match(src, /\/kyc\/uploads/);
  assert.match(src, /uploadSecureDocument/);
});

test('does not attach KYC documents via generic /files/upload or file_id payload', () => {
  const service = kycService();
  const user = userKyc();
  assert.doesNotMatch(service, /post\(['"`]\/files\/upload/);
  assert.match(service, /document_id/);
  assert.doesNotMatch(user, /FileService\.uploadFile/);
  assert.doesNotMatch(user, /\/files\/upload/);
  // Retired generic attachment path throws
  assert.match(service, /Generic KYC media attachment is retired/);
});

test('never requests public visibility for KYC uploads', () => {
  const user = userKyc();
  assert.doesNotMatch(user, /visibility\s*[:=]\s*['"]public['"]/i);
  assert.doesNotMatch(user, /visibility:\s*'public'/);
});

test('consent is required before submit and policy version is submitted', () => {
  const user = userKyc();
  const service = kycService();
  assert.match(user, /consentAccepted/);
  assert.match(user, /Consent required/);
  assert.match(user, /consentPolicyVersion|consent_policy_version/);
  assert.match(service, /consent_accepted/);
  assert.match(service, /consent_policy_version/);
  assert.doesNotMatch(user, /checked=\{true\}/);
});

test('scan failure and malware responses do not expose object keys or storage paths', () => {
  const user = userKyc();
  assert.match(user, /MALWARE_DETECTED|SCANNER_UNAVAILABLE/);
  assert.doesNotMatch(user, /objectKey|storage_key|signedUrl\s*=/);
  assert.match(user, /File failed security scanning|Security scanner is temporarily unavailable/);
});

test('admin viewer uses secure document-view endpoint, not raw fileUrl', () => {
  const admin = adminKyc();
  assert.match(admin, /viewDocumentSecure|\/admin\/kyc\/documents\//);
  assert.match(admin, /Secure view/);
  assert.doesNotMatch(admin, /href=\{doc\.fileUrl\}/);
  assert.doesNotMatch(admin, /href=\{.*file_url/);
});

test('decision reason is required for approve/reject/resubmit', () => {
  const admin = adminKyc();
  assert.match(admin, /reason of at least 3 characters|REASON_REQUIRED|Decision reason \(required\)/);
  assert.match(admin, /approveReason|rejectReason|resubmitReason/);
  assert.match(admin, /updateKYCStatus/);
});

test('signed URL is not stored in localStorage or sessionStorage', () => {
  const admin = adminKyc();
  assert.doesNotMatch(admin, /localStorage\.setItem/);
  assert.doesNotMatch(admin, /sessionStorage\.setItem/);
});

test('identity data is not placed in URL query parameters for document view', () => {
  const admin = adminKyc();
  const service = kycService();
  assert.doesNotMatch(admin, /[?&](email|name|documentNumber|dob)=/);
  assert.match(service, /encodeURIComponent\(documentId\)/);
  assert.match(service, /\/admin\/kyc\/documents\//);
  assert.match(admin, /viewDocumentSecure/);
});

test('permission denial and legacy document handling are covered', () => {
  const admin = adminKyc();
  assert.match(admin, /Permission denied|FORBIDDEN|LEGACY_DOCUMENT/);
});

test('email field is not required in KYC personal info by default', () => {
  const user = userKyc();
  const service = kycService();
  assert.match(user, /enabled:\s*false.*order:\s*60|key: 'email'[\s\S]*enabled: false/);
  assert.match(service, /key === 'email' \? false/);
});
