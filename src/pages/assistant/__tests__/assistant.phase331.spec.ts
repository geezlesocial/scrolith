/**
 * Phase 33.1 — Frontend structure / a11y smoke (no RTL).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const page = resolve(__dirname, '../ScrolithaAssistantPage.tsx');
const composer = resolve(__dirname, '../../../components/ai/AIComposerAssist.tsx');
const service = resolve(__dirname, '../../../services/scrolithaAssistant.ts');
const app = resolve(__dirname, '../../../App.tsx');

describe('Phase 33.1 Assistant UI', () => {
  it('page has disclosure, tabs, feedback, history controls', () => {
    const src = readFileSync(page, 'utf8');
    expect(src).toContain('role="note"');
    expect(src).toContain('role="tablist"');
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain('ThumbsUp');
    expect(src).toContain('draft only');
    expect(src).toContain('Prompt library');
    expect(src).toContain('Clear all');
    expect(src).toContain('Export');
  });

  it('composer assist never auto-submits', () => {
    const src = readFileSync(composer, 'utf8');
    expect(src).toContain('never auto-submits');
    expect(src).toContain('Apply to editor');
    expect(src).toContain('role="region"');
    expect(src).toContain('Generate draft');
  });

  it('service hits assistant API namespace', () => {
    const src = readFileSync(service, 'utf8');
    expect(src).toContain('/ai/assistant/chat');
    expect(src).toContain('/ai/assistant/composer');
    expect(src).toContain('/ai/assistant/translate');
    expect(src).toContain('/ai/assistant/prompts');
    expect(src).toContain('/ai/assistant/feedback');
  });

  it('routes /assistant in App', () => {
    const src = readFileSync(app, 'utf8');
    expect(src).toContain('path="/assistant"');
    expect(src).toContain('ScrolithaAssistantPage');
  });
});
