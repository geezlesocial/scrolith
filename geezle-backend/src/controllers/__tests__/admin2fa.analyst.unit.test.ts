import { isAnalystRole } from '../../services/analystRole';
import { isAdminRole } from '../../services/systemControls.service';

describe('ANALYST MFA policy boundary', () => {
  test('ANALYST is independently policy-protected without inheriting admin authorization', () => {
    expect(isAnalystRole('ANALYST')).toBe(true);
    expect(isAdminRole('ANALYST')).toBe(false);
  });

  test('existing admin and moderator role classification remains unchanged', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('MODERATOR')).toBe(false);
    expect(isAnalystRole('MODERATOR')).toBe(false);
  });
});
