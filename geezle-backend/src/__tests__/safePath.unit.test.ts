import path from 'node:path';
import { isPathWithin, requirePathWithin } from '../utils/security/safePath';

describe('safe filesystem path boundaries', () => {
  test('accepts descendants and rejects traversal/sibling paths', () => {
    const root = path.join(process.cwd(), 'uploads');
    expect(isPathWithin(root, path.join(root, 'safe.bin'))).toBe(true);
    expect(isPathWithin(root, path.join(root, '..', 'secret.txt'))).toBe(false);
    expect(() => requirePathWithin(root, path.join(root, '..', 'secret.txt'))).toThrow();
  });
});
