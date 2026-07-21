import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Lightweight smoke assertions (no DOM). Ensures component contract remains intact.
 */
describe('ScrolithHumanVerification component contract', () => {
  const componentPath = join(__dirname, '..', 'ScrolithHumanVerification.tsx');
  const source = readFileSync(componentPath, 'utf8');

  test('exports default component and accepts endpoint prop', () => {
    expect(source).toContain('export default ScrolithHumanVerification');
    expect(source).toContain('endpoint: HumanVerificationEndpoint');
    expect(source).toContain('onVerified');
  });

  test('is accessible (ARIA + keyboard-friendly buttons)', () => {
    expect(source).toContain('aria-labelledby');
    expect(source).toContain('aria-describedby');
    expect(source).toContain('role="group"');
    expect(source).toContain('aria-label');
    expect(source).toContain('min-h-[48px]');
  });

  test('does not embed third-party captcha scripts', () => {
    expect(source.toLowerCase()).not.toContain('google.com/recaptcha');
    expect(source.toLowerCase()).not.toContain('hcaptcha');
    expect(source.toLowerCase()).not.toContain('turnstile');
  });

  test('never expects correct answer from server payload field', () => {
    expect(source).not.toContain('correctValue');
    expect(source).not.toContain('correctAnswer');
  });
});
