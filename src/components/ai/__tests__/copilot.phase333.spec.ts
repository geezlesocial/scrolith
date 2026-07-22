import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Phase 33.3 Platform Copilot UI', () => {
  it('panel is non-autonomous and accessible', () => {
    const src = readFileSync(resolve(__dirname, '../ScrolithaCopilotPanel.tsx'), 'utf8');
    expect(src).toContain('suggestions only');
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain('role="complementary"');
    expect(src).toContain('never posts');
  });

  it('service hits copilot APIs', () => {
    const src = readFileSync(resolve(__dirname, '../../../services/scrolithaCopilot.ts'), 'utf8');
    expect(src).toContain('/ai/copilot');
    expect(src).toContain('/ai/skills');
    expect(src).toContain('/ai/orchestrate');
  });

  it('App keeps the canonical logo-backed assistant as the only floating assistant', () => {
    const src = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');
    expect(src).toContain("import('./components/SupportWidget')");
    expect(src).not.toContain('ScrolithaCopilotPanel');
  });
});
