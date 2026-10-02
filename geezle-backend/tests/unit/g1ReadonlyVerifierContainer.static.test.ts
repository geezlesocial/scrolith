import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dockerfile = readFileSync(join(__dirname, '../../Dockerfile.g1-readonly-verifier'), 'utf8');
const runtimeStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));

describe('G1 verifier runtime image static safety', () => {
  test('uses exactly the direct verifier exec-form entrypoint', () => {
    expect(runtimeStage).toContain('ENTRYPOINT ["node", "/opt/g1/g1-readonly-member-verifier.js"]');
    expect(runtimeStage).not.toMatch(/^\s*ENTRYPOINT\s+(?!\[)/m);
    expect(runtimeStage).not.toMatch(/^\s*CMD\b/m);
  });

  test('runs as the dedicated non-root UID/GID', () => {
    expect(runtimeStage).toMatch(/addgroup\s+-S\s+-g\s+10001\s+verifier/);
    expect(runtimeStage).toMatch(/adduser\s+-S\s+-D\s+-H\s+-u\s+10001\s+-G\s+verifier\s+verifier/);
    expect(runtimeStage).toMatch(/^USER\s+10001:10001\s*$/m);
  });

  test('runtime contains no API, migration, seed, shell, or build-tool startup path', () => {
    expect(runtimeStage).not.toMatch(/(?:src\/server|dist\/server|npm\s+run\s+(?:start|dev)|prisma\s+migrate|prisma\s+db\s+seed|seed\.ts|migrations)/i);
    expect(runtimeStage).not.toMatch(/^(?:ENTRYPOINT|CMD)\s+(?:sh|\/bin\/sh|ash|\/bin\/ash|npm|npx)\b/im);
    expect(runtimeStage).not.toMatch(/COPY\s+(?:--from=build\s+)?(?:prisma|scripts|src|tests|node_modules\/\.bin)\b/i);
    expect(runtimeStage).toMatch(/COPY\s+--from=build\s+\/opt\/g1\/dist\/g1-readonly-member-verifier\.js/);
  });

  test('pins both build and runtime bases to the revalidated amd64 manifest digest', () => {
    const baseRefs = dockerfile.match(/^FROM\s+--platform=linux\/amd64\s+node:[^\s@]+@sha256:[a-f0-9]{64}\s+AS\s+\w+$/gim) ?? [];
    expect(baseRefs).toHaveLength(2);
    expect(baseRefs[0]).toContain('sha256:b64da1de5a51067ab8e75f0bc8dbd0905d8894baa22261f439a4572f41291e50');
    expect(baseRefs[1]).toContain('sha256:b64da1de5a51067ab8e75f0bc8dbd0905d8894baa22261f439a4572f41291e50');
  });

  test('contains no selectors, database URLs, credentials, tokens, or secret literals', () => {
    expect(runtimeStage).not.toMatch(/G1_MEMBER_[AB]_SELECTOR/);
    expect(runtimeStage).not.toMatch(/(?:ENV|ARG)\s+DATABASE_URL\s*=/);
    expect(runtimeStage).not.toMatch(/postgres(?:ql)?:\/\//i);
    expect(dockerfile).not.toMatch(/G1_MEMBER_[AB]_SELECTOR\s*=/);
    expect(dockerfile).not.toMatch(/(?:DATABASE_URL|G1_MEMBER_[AB]_SELECTOR)\s*=/);
    expect(dockerfile).not.toMatch(/postgres(?:ql)?:\/\//i);
    expect(dockerfile).not.toMatch(/(?:password|access[_-]?token|secret)\s*[:=]\s*[^\s]/i);
    expect(dockerfile).not.toMatch(/COPY\s+prisma\.config\.ts/);
  });
});
