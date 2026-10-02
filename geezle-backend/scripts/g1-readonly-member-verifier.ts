export interface ReadonlyUserLookup {
  where: { OR: [{ id: string }, { email: string }] };
  select: { id: true; role: true; isActive: true };
  take: 2;
}

export interface UserProjection {
  id: string;
  role: string;
  isActive: boolean;
}

export type FindUsers = (query: ReadonlyUserLookup) => Promise<UserProjection[]>;

interface PrismaHandle {
  user: { findMany: FindUsers };
  $disconnect: () => Promise<void>;
}

interface PoolHandle {
  on: (event: 'error', listener: (error: Error) => void) => void;
  end: () => Promise<void>;
}

export interface MemberResult {
  exists: boolean;
  roleUser: boolean;
  active: boolean;
}

export interface VerificationResult {
  memberA: MemberResult;
  memberB: MemberResult;
  passed: boolean;
}

const failedMember = (): MemberResult => ({ exists: false, roleUser: false, active: false });
const failedResult = (): VerificationResult => ({
  memberA: failedMember(),
  memberB: failedMember(),
  passed: false,
});

const hasSelector = (selector: string | undefined): selector is string =>
  typeof selector === 'string' && selector.trim().length > 0;

async function inspectMember(selector: string, findUsers: FindUsers): Promise<{ result: MemberResult; id?: string }> {
  const matches = await findUsers({
    where: { OR: [{ id: selector }, { email: selector }] },
    select: { id: true, role: true, isActive: true },
    take: 2,
  });

  if (matches.length !== 1) return { result: failedMember() };

  const [user] = matches;
  return {
    id: user.id,
    result: {
      exists: true,
      roleUser: user.role === 'USER',
      active: user.isActive === true,
    },
  };
}

const allChecksPassed = (result: Omit<VerificationResult, 'passed'>): boolean =>
  Object.values(result).every((member) => member.exists && member.roleUser && member.active);

/** Performs only bounded, exact-match reads. Selectors and returned IDs are never rendered. */
export async function verifyMembers(
  selectors: { memberA: string | undefined; memberB: string | undefined },
  findUsers: FindUsers,
): Promise<VerificationResult> {
  if (
    !hasSelector(selectors.memberA) ||
    !hasSelector(selectors.memberB) ||
    selectors.memberA === selectors.memberB
  ) {
    return failedResult();
  }

  try {
    const [memberA, memberB] = await Promise.all([
      inspectMember(selectors.memberA, findUsers),
      inspectMember(selectors.memberB, findUsers),
    ]);

    // The selectors must resolve to two distinct accounts, not aliases for one record.
    if (memberA.id && memberA.id === memberB.id) return failedResult();

    const result = { memberA: memberA.result, memberB: memberB.result };
    return { ...result, passed: allChecksPassed(result) };
  } catch {
    return failedResult();
  }
}

export function renderSanitizedOutput(result: VerificationResult): string {
  const status = (passed: boolean) => (passed ? 'PASS' : 'FAIL');
  return [
    `Member A exists: ${status(result.memberA.exists)}`,
    `Member A role USER: ${status(result.memberA.roleUser)}`,
    `Member A active: ${status(result.memberA.active)}`,
    `Member B exists: ${status(result.memberB.exists)}`,
    `Member B role USER: ${status(result.memberB.roleUser)}`,
    `Member B active: ${status(result.memberB.active)}`,
  ].join('\n');
}

function printResult(result: VerificationResult): void {
  process.stdout.write(`${renderSanitizedOutput(result)}\n`);
  process.exitCode = result.passed ? 0 : 1;
}

async function runVerifier(): Promise<void> {
  const selectors = {
    memberA: process.env.G1_MEMBER_A_SELECTOR,
    memberB: process.env.G1_MEMBER_B_SELECTOR,
  };
  const connectionString = process.env.DATABASE_URL;

  if (
    !hasSelector(selectors.memberA) ||
    !hasSelector(selectors.memberB) ||
    selectors.memberA === selectors.memberB ||
    !connectionString
  ) {
    printResult(failedResult());
    return;
  }

  let prisma: PrismaHandle | undefined;
  let pool: PoolHandle | undefined;
  let poolErrorOccurred = false;
  let result = failedResult();

  try {
    const { PrismaClient } = require('@prisma/client') as {
      PrismaClient: new (options: { adapter: unknown }) => PrismaHandle;
    };
    const { PrismaPg } = require('@prisma/adapter-pg') as {
      PrismaPg: new (pool: PoolHandle) => unknown;
    };
    const { Pool } = require('pg') as {
      Pool: new (options: { connectionString: string; connectionTimeoutMillis: number; max: number }) => PoolHandle;
    };

    pool = new Pool({ connectionString, connectionTimeoutMillis: 5000, max: 1 });
    pool.on('error', () => {
      poolErrorOccurred = true;
    });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as unknown as PrismaHandle;
    result = await verifyMembers(selectors, (query) => prisma!.user.findMany(query));
    if (poolErrorOccurred) result = failedResult();
  } catch {
    result = failedResult();
  } finally {
    try {
      await prisma?.$disconnect();
      await pool?.end();
      if (poolErrorOccurred) result = failedResult();
    } catch {
      result = failedResult();
    }
  }

  printResult(result);
}

if (require.main === module) {
  void runVerifier().catch(() => printResult(failedResult()));
}
