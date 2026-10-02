import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const job = readFileSync(join(__dirname, '../../../deploy/azure/g1-readonly-verifier-job.bicep'), 'utf8');

describe('G1 verifier ACA Job static safety', () => {
  test('is manual, bounded, single-replica, and zero-retry', () => {
    expect(job).toMatch(/triggerType:\s*'Manual'/);
    expect(job).toMatch(/replicaTimeout:\s*120\b/);
    expect(job).toMatch(/replicaRetryLimit:\s*0\b/);
    expect(job).toMatch(/manualTriggerConfig:\s*\{\s*parallelism:\s*1\s*replicaCompletionCount:\s*1/s);
  });

  test('defines one main container and no init container, ingress, command, or args override', () => {
    expect(job.match(/\bcontainers:\s*\[/g) ?? []).toHaveLength(1);
    expect(job.match(/name:\s*'g1-readonly-verifier'/g) ?? []).toHaveLength(1);
    expect(job).not.toMatch(/\binitContainers\s*:/);
    expect(job).not.toMatch(/\bingress\s*:/i);
    expect(job).not.toMatch(/^\s*(?:command|args)\s*:/im);
  });

  test('constructs the fixed staging image from a digest-only parameter', () => {
    expect(job).toMatch(/param imageDigestHex string/);
    expect(job).toMatch(/@minLength\(64\)[\s\S]*@maxLength\(64\)[\s\S]*param imageDigestHex string/);
    expect(job).toContain("var stagingAcrLoginServer = 'acrscrolithstaging8098.azurecr.io'");
    expect(job).toContain("var verifierImage = '${stagingAcrLoginServer}/scrolith-g1-readonly-verifier@sha256:${imageDigestHex}'");
    expect(job).not.toMatch(/image:\s*['"][^'"\n]*:[^@'"\n]+['"]/);
  });

  test('uses Key Vault-backed secret references for the DB URL and both selectors', () => {
    for (const name of ['databaseUrlKeyVaultSecretUri', 'memberASelectorKeyVaultSecretUri', 'memberBSelectorKeyVaultSecretUri']) {
      expect(job).toMatch(new RegExp(`@secure\\(\\)[\\s\\S]*?param ${name} string`));
    }
    expect(job).toMatch(/name:\s*'DATABASE_URL'\s*secretRef:\s*'g1-database-url'/s);
    expect(job).toMatch(/name:\s*'G1_MEMBER_A_SELECTOR'\s*secretRef:\s*'g1-member-a-selector'/s);
    expect(job).toMatch(/name:\s*'G1_MEMBER_B_SELECTOR'\s*secretRef:\s*'g1-member-b-selector'/s);
    expect(job).not.toMatch(/name:\s*'G1_MEMBER_[AB]_SELECTOR'\s*value\s*:/s);
    expect(job).not.toMatch(/\bcommand\s*:|\bargs\s*:/i);
  });

  test('has no production references or direct per-execution overrides', () => {
    expect(job).not.toMatch(/(?:scrolith-prod|productionEnvironment|prodAcr|prodEnvironment)/i);
    expect(job).toMatch(/param stagingEnvironmentResourceId string/);
    expect(job).not.toMatch(/(?:executionOverride|templateOverride|job start)/i);
  });
});
