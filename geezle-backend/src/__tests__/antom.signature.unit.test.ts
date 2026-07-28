/**
 * Unit tests for Antom RSA request signing helpers.
 * Uses generated ephemeral keys so CI never needs merchant secrets.
 */
import { generateKeyPairSync } from 'crypto';
import {
  buildAntomSignature,
  verifyAntomSignature,
  toAntomAmountValue,
  mapAntomNotifyStatus,
  extractAntomSignatureValue
} from '../services/payments/providers/antom';

describe('Antom AMS helpers', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  test('toAntomAmountValue uses minor units', () => {
    expect(toAntomAmountValue(10.5)).toBe('1050');
    expect(toAntomAmountValue(1)).toBe('100');
  });

  test('sign and verify round-trip', () => {
    const requestUri = '/ams/api/v1/payments/pay';
    const clientId = 'SANDBOX_TEST_CLIENT';
    const requestTime = '1685599933871';
    const requestBody = JSON.stringify({ productCode: 'CASHIER_PAYMENT', paymentRequestId: 'req1' });
    const signature = buildAntomSignature({
      requestUri,
      clientId,
      requestTime,
      requestBody,
      merchantPrivateKey: privateKey
    });
    expect(signature.length).toBeGreaterThan(20);

    // Merchant signs with private key; verification of our own signature uses matching public key.
    // (Antom responses use Antom public key; this validates our signing primitive.)
    const ok = verifyAntomSignature({
      requestUri,
      clientId,
      responseTime: requestTime,
      responseBody: requestBody,
      targetSignature: signature,
      antomPublicKey: publicKey
    });
    expect(ok).toBe(true);
  });

  test('extractAntomSignatureValue parses Signature header', () => {
    expect(
      extractAntomSignatureValue('algorithm=RSA256, keyVersion=1, signature=abc%2Bdef')
    ).toBe('abc%2Bdef');
  });

  test('mapAntomNotifyStatus maps success and failure', () => {
    expect(mapAntomNotifyStatus({ result: { resultStatus: 'S' } })).toBe('succeeded');
    expect(mapAntomNotifyStatus({ paymentStatus: 'SUCCESS' })).toBe('succeeded');
    expect(mapAntomNotifyStatus({ result: { resultStatus: 'F' } })).toBe('failed');
    expect(mapAntomNotifyStatus({ result: { resultStatus: 'U' } })).toBe('pending');
  });
});
