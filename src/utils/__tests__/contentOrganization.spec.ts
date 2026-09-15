import { describe, expect, it } from 'vitest';
import { organizeReadableText } from '../contentOrganization';

describe('content organization fallback', () => {
  it('keeps source wording while separating dense lines and list items', () => {
    const result = organizeReadableText('Overview\nScrolith connects professionals. It supports creators.\n- Publish updates\n- Find opportunities');
    expect(result).toContain('Overview');
    expect(result).toContain('Scrolith connects professionals. It supports creators.');
    expect(result).toContain('- Publish updates');
    expect(result.split('\n\n').length).toBeGreaterThan(2);
  });
});
