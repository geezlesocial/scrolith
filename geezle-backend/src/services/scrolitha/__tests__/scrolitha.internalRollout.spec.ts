/**
 * Phase 13 — internal Scrolitha rollout gates.
 */
import {
  assertScrolithaAccess,
  getInternalAllowlist,
  getRolloutSummary,
  invalidateRolloutCache,
  isCapabilityEnabled,
  isInternalRolloutEnabled,
  isInternalScrolithaActor,
  isScrolithaUserFacingAccessAllowed,
  resolveScrolithaRolloutFlags
} from '../scrolitha.rollout';

describe('scrolitha Phase 13 internal rollout', () => {
  const prevEnv: Record<string, string | undefined> = {};

  const setEnv = (key: string, value?: string) => {
    if (!(key in prevEnv)) prevEnv[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    invalidateRolloutCache();
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    Object.keys(prevEnv).forEach((k) => delete prevEnv[k]);
    invalidateRolloutCache();
  });

  test('internal rollout off keeps public dark even for admins', async () => {
    setEnv('SCROLITHA_ROLLOUT_MASTER', 'false');
    setEnv('SCROLITHA_INTERNAL_ROLLOUT', 'false');
    setEnv('SCROLITHA_INTERNAL_ALLOW_ADMINS', 'true');
    expect(isInternalRolloutEnabled()).toBe(false);
    expect(isInternalScrolithaActor({ id: 'a1', role: 'admin', isAdmin: true, email: 'admin@scrolith.com' })).toBe(
      false
    );
    expect(await isScrolithaUserFacingAccessAllowed({ id: 'a1', role: 'admin', isAdmin: true })).toBe(false);
    expect(await isCapabilityEnabled('osSurface', { id: 'a1', role: 'admin', isAdmin: true })).toBe(false);
  });

  test('internal rollout allows admins without public master', async () => {
    setEnv('SCROLITHA_ROLLOUT_MASTER', 'false');
    setEnv('SCROLITHA_INTERNAL_ROLLOUT', 'true');
    setEnv('SCROLITHA_INTERNAL_ALLOW_ADMINS', 'true');
    const admin = { id: 'admin-1', role: 'admin', isAdmin: true, email: 'admin@scrolith.com' };
    const regular = { id: 'user-9', role: 'user', isAdmin: false, email: 'member@example.com' };

    expect(await isScrolithaUserFacingAccessAllowed(admin)).toBe(true);
    expect(await isScrolithaUserFacingAccessAllowed(regular)).toBe(false);
    expect(await isCapabilityEnabled('master', admin)).toBe(true);
    expect(await isCapabilityEnabled('osSurface', admin)).toBe(true);
    expect(await isCapabilityEnabled('aiReplies', admin)).toBe(true);
    expect(await isCapabilityEnabled('osSurface', regular)).toBe(false);

    await expect(assertScrolithaAccess(regular, 'Scrolitha chat')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SCROLITHA_ACCESS_DENIED'
    });
    await expect(assertScrolithaAccess(admin, 'Scrolitha chat')).resolves.toBeUndefined();
  });

  test('allowlist matches user id and email', async () => {
    setEnv('SCROLITHA_ROLLOUT_MASTER', 'false');
    setEnv('SCROLITHA_INTERNAL_ROLLOUT', 'true');
    setEnv('SCROLITHA_INTERNAL_ALLOW_ADMINS', 'false');
    setEnv('SCROLITHA_INTERNAL_ALLOWLIST', 'cm_tester_1,qa@scrolith.com');

    const list = getInternalAllowlist();
    expect(list.ids).toContain('cm_tester_1');
    expect(list.emails).toContain('qa@scrolith.com');

    expect(
      await isScrolithaUserFacingAccessAllowed({
        id: 'cm_tester_1',
        role: 'user',
        email: 'other@x.com',
        isAdmin: false
      })
    ).toBe(true);
    expect(
      await isScrolithaUserFacingAccessAllowed({
        id: 'someone-else',
        role: 'user',
        email: 'QA@Scrolith.com',
        isAdmin: false
      })
    ).toBe(true);
    expect(
      await isScrolithaUserFacingAccessAllowed({
        id: 'nope',
        role: 'user',
        email: 'public@example.com',
        isAdmin: false
      })
    ).toBe(false);
  });

  test('public master still enables everyone', async () => {
    setEnv('SCROLITHA_ROLLOUT_MASTER', 'true');
    setEnv('SCROLITHA_ROLLOUT_OS_SURFACE', 'true');
    setEnv('SCROLITHA_INTERNAL_ROLLOUT', 'false');
    const regular = { id: 'u1', role: 'user', isAdmin: false };
    expect(await isScrolithaUserFacingAccessAllowed(regular)).toBe(true);
    expect(await isCapabilityEnabled('osSurface', regular)).toBe(true);
  });

  test('global flags remain master=false while internal is on', async () => {
    setEnv('SCROLITHA_ROLLOUT_MASTER', 'false');
    setEnv('SCROLITHA_INTERNAL_ROLLOUT', 'true');
    const flags = await resolveScrolithaRolloutFlags();
    expect(flags.master).toBe(false);
    expect(flags.osSurface).toBe(false); // public flag view
    const summary = await getRolloutSummary({ id: 'admin-1', role: 'admin', isAdmin: true });
    expect(summary.access.mode).toBe('internal');
    expect(summary.access.publicMaster).toBe(false);
    expect(summary.rollback.disableInternalOnly).toMatch(/INTERNAL_ROLLOUT/);
  });
});
