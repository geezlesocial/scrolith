/**
 * Phase 33.2 — Frontend structure smoke tests.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const page = resolve(__dirname, '../PersonalizedDiscovery.tsx');
const service = resolve(__dirname, '../../../services/scrolithaDiscovery.ts');
const app = resolve(__dirname, '../../../App.tsx');
const admin = resolve(__dirname, '../../../dashboard/admin/ScrolithaAIFoundation.tsx');

describe('Phase 33.2 Personalized Discovery UI', () => {
  it('has explainability, feedback, memory controls', () => {
    const src = readFileSync(page, 'utf8');
    expect(src).toContain('Why am I seeing this?');
    expect(src).toContain('Useful');
    expect(src).toContain('Not interested');
    expect(src).toContain('Hide similar');
    expect(src).toContain('AI memory');
    expect(src).toContain('role="note"');
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain('Export memory');
  });

  it('service targets discovery APIs', () => {
    const src = readFileSync(service, 'utf8');
    expect(src).toContain('/ai/discovery/recommendations');
    expect(src).toContain('/ai/discovery/feed-scores');
    expect(src).toContain('/ai/discovery/memory');
    expect(src).toContain('/ai/discovery/search-assist');
    expect(src).toContain('/admin/ai/discovery/analytics');
  });

  it('routes /discovery', () => {
    const src = readFileSync(app, 'utf8');
    expect(src).toContain('path="/discovery"');
    expect(src).toContain('PersonalizedDiscovery');
  });

  it('admin has discovery analytics tab', () => {
    const src = readFileSync(admin, 'utf8');
    expect(src).toContain('Discovery Analytics');
    expect(src).toContain('adminAnalytics');
  });
});
