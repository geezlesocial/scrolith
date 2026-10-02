import {
  FindUsers,
  ReadonlyUserLookup,
  renderSanitizedOutput,
  UserProjection,
  verifyMembers,
} from '../../scripts/g1-readonly-member-verifier';

const selectors = { memberA: 'member-a.private@example.test', memberB: 'member-b.private@example.test' };
const user = (id: string, role = 'USER', isActive = true): UserProjection => ({ id, role, isActive });
const lookup = (records: UserProjection[]): jest.MockedFunction<FindUsers> =>
  jest.fn(async (_query: ReadonlyUserLookup) => records);
const expectedQuery = (selector: string): ReadonlyUserLookup => ({
  where: { OR: [{ id: selector }, { email: selector }] },
  select: { id: true, role: true, isActive: true },
  take: 2,
});

describe('G1 read-only member verifier', () => {
  it('passes when both distinct accounts are active USERs', async () => {
    const findUsers = jest.fn<ReturnType<FindUsers>, Parameters<FindUsers>>()
      .mockResolvedValueOnce([user('internal-a')])
      .mockResolvedValueOnce([user('internal-b')]);

    const result = await verifyMembers(selectors, findUsers);

    expect(result.passed).toBe(true);
    expect(result.memberA).toEqual({ exists: true, roleUser: true, active: true });
    expect(result.memberB).toEqual({ exists: true, roleUser: true, active: true });
    expect(findUsers).toHaveBeenCalledTimes(2);
    expect(findUsers).toHaveBeenNthCalledWith(1, expectedQuery(selectors.memberA));
    expect(findUsers).toHaveBeenNthCalledWith(2, expectedQuery(selectors.memberB));
  });

  it('fails the role check for a non-USER role', async () => {
    const findUsers = jest.fn<ReturnType<FindUsers>, Parameters<FindUsers>>()
      .mockResolvedValueOnce([user('internal-a', 'ADMIN')])
      .mockResolvedValueOnce([user('internal-b')]);

    const result = await verifyMembers(selectors, findUsers);

    expect(result.memberA).toEqual({ exists: true, roleUser: false, active: true });
    expect(result.passed).toBe(false);
  });

  it('fails the active check unless isActive is exactly true', async () => {
    const findUsers = jest.fn<ReturnType<FindUsers>, Parameters<FindUsers>>()
      .mockResolvedValueOnce([user('internal-a', 'USER', false)])
      .mockResolvedValueOnce([user('internal-b')]);

    const result = await verifyMembers(selectors, findUsers);

    expect(result.memberA).toEqual({ exists: true, roleUser: true, active: false });
    expect(result.passed).toBe(false);
  });

  it('fails closed without both distinct selectors and performs no reads', async () => {
    const findUsers = lookup([]);

    expect(await verifyMembers({ memberA: undefined, memberB: selectors.memberB }, findUsers)).toMatchObject({ passed: false });
    expect(await verifyMembers({ memberA: selectors.memberA, memberB: undefined }, findUsers)).toMatchObject({ passed: false });
    expect(await verifyMembers({ memberA: selectors.memberA, memberB: selectors.memberA }, findUsers)).toMatchObject({ passed: false });
    expect(findUsers).not.toHaveBeenCalled();
  });

  it('fails closed for missing or ambiguous selector matches', async () => {
    const missing = jest.fn<ReturnType<FindUsers>, Parameters<FindUsers>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([user('internal-b')]);
    const missingResult = await verifyMembers(selectors, missing);
    expect(missingResult.memberA).toEqual({ exists: false, roleUser: false, active: false });
    expect(missingResult.passed).toBe(false);

    const ambiguous = jest.fn<ReturnType<FindUsers>, Parameters<FindUsers>>()
      .mockResolvedValueOnce([user('one'), user('two')])
      .mockResolvedValueOnce([user('internal-b')]);
    const ambiguousResult = await verifyMembers(selectors, ambiguous);
    expect(ambiguousResult.memberA).toEqual({ exists: false, roleUser: false, active: false });
    expect(ambiguousResult.passed).toBe(false);
    expect(ambiguous).toHaveBeenCalledTimes(2);
  });

  it('fails closed if both selectors resolve to the same account', async () => {
    const findUsers = jest.fn<ReturnType<FindUsers>, Parameters<FindUsers>>()
      .mockResolvedValueOnce([user('same-internal-id')])
      .mockResolvedValueOnce([user('same-internal-id')]);

    expect(await verifyMembers(selectors, findUsers)).toMatchObject({
      memberA: { exists: false, roleUser: false, active: false },
      memberB: { exists: false, roleUser: false, active: false },
      passed: false,
    });
  });

  it('fails closed on a rejected read', async () => {
    const findUsers = jest.fn<ReturnType<FindUsers>, Parameters<FindUsers>>().mockRejectedValue(new Error('private error'));

    expect(await verifyMembers(selectors, findUsers)).toMatchObject({
      memberA: { exists: false, roleUser: false, active: false },
      memberB: { exists: false, roleUser: false, active: false },
      passed: false,
    });
  });

  it('does not render selectors or internal IDs in PASS output', async () => {
    const findUsers = jest.fn<ReturnType<FindUsers>, Parameters<FindUsers>>()
      .mockResolvedValueOnce([user('must-not-appear-a')])
      .mockResolvedValueOnce([user('must-not-appear-b')]);
    const rendered = renderSanitizedOutput(await verifyMembers(selectors, findUsers));

    expect(rendered).toBe([
      'Member A role USER: PASS',
      'Member A active: PASS',
      'Member B role USER: PASS',
      'Member B active: PASS',
    ].join('\n'));
    expect(rendered.split('\n')).toHaveLength(4);
    expect(rendered).not.toMatch(/exists:/i);
    for (const privateValue of [...Object.values(selectors), 'must-not-appear-a', 'must-not-appear-b']) {
      expect(rendered).not.toContain(privateValue);
    }
  });

  it('does not render selectors or internal IDs in FAIL output', async () => {
    const findUsers = jest.fn<ReturnType<FindUsers>, Parameters<FindUsers>>()
      .mockResolvedValueOnce([user('private-internal-id-a', 'ADMIN')])
      .mockResolvedValueOnce([user('private-internal-id-b')]);
    const result = await verifyMembers(selectors, findUsers);
    const rendered = renderSanitizedOutput(result);

    expect(result.passed).toBe(false);
    expect(rendered).toBe([
      'Member A role USER: FAIL',
      'Member A active: PASS',
      'Member B role USER: PASS',
      'Member B active: PASS',
    ].join('\n'));
    expect(rendered.split('\n')).toHaveLength(4);
    expect(rendered).not.toMatch(/exists:/i);
    for (const privateValue of [...Object.values(selectors), 'private-internal-id-a', 'private-internal-id-b']) {
      expect(rendered).not.toContain(privateValue);
    }
  });

  it('turns a rejected read into only sanitized FAIL output', async () => {
    const privateErrorMessage = 'sensitive database detail must never be shown';
    const findUsers = jest.fn<ReturnType<FindUsers>, Parameters<FindUsers>>()
      .mockRejectedValue(new Error(privateErrorMessage));
    const result = await verifyMembers(selectors, findUsers);
    const rendered = renderSanitizedOutput(result);

    expect(rendered).toBe([
      'Member A role USER: FAIL',
      'Member A active: FAIL',
      'Member B role USER: FAIL',
      'Member B active: FAIL',
    ].join('\n'));
    expect(rendered.split('\n')).toHaveLength(4);
    expect(rendered).not.toMatch(/exists:/i);
    for (const privateValue of [...Object.values(selectors), privateErrorMessage]) {
      expect(rendered).not.toContain(privateValue);
    }
    expect(result.passed).toBe(false);
  });
});
