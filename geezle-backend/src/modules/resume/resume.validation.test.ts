import { RESUME_REVIEW_COMPLIANCE_NOTICE, scrubProtectedTraitLanguage } from './resume.prompts';
import { generateResumeSchema, reviewProfileUrlSchema } from './resume.validation';
import { resolveResumeStoragePath } from './resume.storage.service';

describe('resume AI validation and compliance helpers', () => {
  it('defaults resume generation to the professional template', () => {
    const parsed = generateResumeSchema.parse({});
    expect(parsed.template).toBe('professional');
    expect(parsed.includePhoto).toBe(false);
  });

  it('requires role criteria for profile URL reviews', () => {
    expect(() =>
      reviewProfileUrlSchema.parse({
        profileUrl: 'https://scrolith.com/profile/jane',
        jobDescription: 'short'
      })
    ).toThrow();
  });

  it('scrubs disallowed autonomous hiring language', () => {
    const scrubbed = scrubProtectedTraitLanguage('Hire this candidate. Reject this candidate. This person seems old.');
    expect(scrubbed.toLowerCase()).not.toContain('hire this candidate');
    expect(scrubbed.toLowerCase()).not.toContain('reject this candidate');
    expect(scrubbed.toLowerCase()).not.toContain('seems old');
    expect(RESUME_REVIEW_COMPLIANCE_NOTICE).toContain('Final hiring decisions');
  });

  it('rejects resume storage keys that escape the fixed local root', () => {
    expect(() => resolveResumeStoragePath('../outside-resume.pdf')).toThrow('Invalid storage key');
    expect(() => resolveResumeStoragePath('nested/../../outside-resume.pdf')).toThrow('Invalid storage key');
  });
});
