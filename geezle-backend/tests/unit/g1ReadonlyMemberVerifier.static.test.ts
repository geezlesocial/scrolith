import fs from 'fs';
import path from 'path';
import ts from 'typescript';

describe('G1 member verifier static read-only guard', () => {
  it('contains no mutation, raw-query, transaction, or process-execution mechanisms', () => {
    const verifierPath = path.resolve(__dirname, '../../scripts/g1-readonly-member-verifier.ts');
    const source = fs.readFileSync(verifierPath, 'utf8');
    const forbiddenTokens = [
      /\bcreate\b/,
      /\bcreateMany\b/,
      /\bupdate\b/,
      /\bupdateMany\b/,
      /\bupsert\b/,
      /\bdelete\b/,
      /\bdeleteMany\b/,
      /\$executeRaw\b/,
      /\$executeRawUnsafe\b/,
      /\$queryRaw\b/,
      /\$queryRawUnsafe\b/,
      /\$transaction\b/,
      /\bchild_process\b/,
      /\bexec(?:File)?(?:Sync)?\b/,
      /\bspawn(?:Sync)?\b/,
      /\bfork\b/,
      /\beval\b/,
      /\bFunction\b/,
      /\bmigrat\w*\b/i,
      /\bseed\w*\b/i,
    ];

    for (const forbiddenToken of forbiddenTokens) {
      expect(source).not.toMatch(forbiddenToken);
    }
  });

  it('has exactly one executable Prisma data-access call: prisma.user.findMany(...)', () => {
    const verifierPath = path.resolve(__dirname, '../../scripts/g1-readonly-member-verifier.ts');
    const source = fs.readFileSync(verifierPath, 'utf8');
    const sourceFile = ts.createSourceFile(verifierPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const prismaDataMethods = new Set([
      'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
      'create', 'createMany', 'createManyAndReturn', 'update', 'updateMany',
      'updateManyAndReturn', 'upsert', 'delete', 'deleteMany', 'count', 'aggregate',
      'groupBy', 'findRaw', 'aggregateRaw', '$executeRaw', '$executeRawUnsafe',
      '$queryRaw', '$queryRawUnsafe', '$transaction',
    ]);
    const dataAccessCalls: ts.CallExpression[] = [];
    const userFindManyAccesses: ts.PropertyAccessExpression[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const methodName = ts.isPropertyAccessExpression(expression)
          ? expression.name.text
          : ts.isElementAccessExpression(expression) && expression.argumentExpression && ts.isStringLiteral(expression.argumentExpression)
            ? expression.argumentExpression.text
            : undefined;
        if (methodName && prismaDataMethods.has(methodName)) dataAccessCalls.push(node);
      }

      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'findMany' &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'user'
      ) {
        userFindManyAccesses.push(node);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    expect(userFindManyAccesses).toHaveLength(1);
    expect(ts.isCallExpression(userFindManyAccesses[0].parent)).toBe(true);
    expect((userFindManyAccesses[0].parent as ts.CallExpression).expression).toBe(userFindManyAccesses[0]);
    expect(dataAccessCalls).toHaveLength(1);
    expect(dataAccessCalls[0]).toBe(userFindManyAccesses[0].parent);
  });
});
