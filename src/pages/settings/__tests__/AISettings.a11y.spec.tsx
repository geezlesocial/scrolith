/**
 * Phase 33.0 — AI settings / service smoke tests (no RTL dependency).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const aiSettingsPath = resolve(__dirname, '../AISettings.tsx');
const servicePath = resolve(__dirname, '../../../services/scrolithaAi.ts');
const adminPath = resolve(__dirname, '../../../dashboard/admin/ScrolithaAIFoundation.tsx');

describe('Phase 33.0 AI settings UI structure', () => {
  it('AISettings page includes disclosure, consent switches, and a11y roles', () => {
    const src = readFileSync(aiSettingsPath, 'utf8');
    expect(src).toContain('role="note"');
    expect(src).toContain('role="switch"');
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain('AI outputs can be wrong');
    expect(src).toContain('externalProviderProcessingAllowed');
    expect(src).toContain('privateMessageAnalysisAllowed');
    expect(src).toContain('Delete history');
    expect(src).toContain('motion-reduce');
    expect(src).toContain('role="table"');
  });

  it('admin Scrolitha AI foundation has required sections', () => {
    const src = readFileSync(adminPath, 'utf8');
    for (const section of [
      'Overview',
      'Providers',
      'Models',
      'Capabilities',
      'Prompts',
      'Usage',
      'Safety',
      'Health',
      'Feature Flags',
      'Audit Logs',
      'Settings'
    ]) {
      expect(src).toContain(section);
    }
    expect(src).toContain('role="tablist"');
    expect(src).toContain('No autonomous');
  });

  it('client service targets foundation endpoints', () => {
    const src = readFileSync(servicePath, 'utf8');
    expect(src).toContain('/ai/status');
    expect(src).toContain('/ai/preferences');
    expect(src).toContain('/ai/history');
    expect(src).toContain('/admin/ai/overview');
    expect(src).toContain('X-Confirm-AI-Risk');
  });
});

describe('Phase 33.0 ScrolithaAIService contract', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports service methods', async () => {
    vi.mock('../../../services/api', () => ({
      default: {
        get: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
        patch: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
        post: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
        delete: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
        put: vi.fn().mockResolvedValue({ data: { success: true, data: {} } })
      }
    }));
    const mod = await import('../../../services/scrolithaAi');
    expect(typeof mod.ScrolithaAIService.getStatus).toBe('function');
    expect(typeof mod.ScrolithaAIService.updatePreferences).toBe('function');
    expect(typeof mod.ScrolithaAIService.deleteHistory).toBe('function');
    expect(typeof mod.ScrolithaAIService.adminPutFlags).toBe('function');
  });
});
