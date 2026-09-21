import fs from 'node:fs';
import path from 'node:path';

describe('G2.6I provider notification authorization', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../controllers/walletFunding.controller.ts'),
    'utf8'
  );

  test('Antom notifications fail closed without verification configuration', () => {
    expect(source).toContain("return res.status(503).json(antomNotifyAckFailure('Antom notification verification is not configured'));");
  });

  test('Antom notifications reject incomplete or invalid signature envelopes before settlement', () => {
    expect(source).toContain("return res.status(401).json(antomNotifyAckFailure('Missing Antom notify signature'));");
    expect(source).toContain("return res.status(401).json(antomNotifyAckFailure('Invalid Antom notify signature'));");
    const handler = source.slice(source.indexOf('export const handleAntomNotify'));
    expect(handler.indexOf('if (!targetSignature || !requestTime || !clientId)')).toBeLessThan(
      handler.indexOf('settleWalletFundingIntent(')
    );
  });
});
