/**
 * Mobile conversation ⋯ menu must portal all sections (not clip to Report/Block only).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  buildConversationMenuItems,
  groupMenuItemsBySection
} from '../../src/components/messaging/conversationMenuPolicy';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('Phase 29.7 conversation menu mobile portal', () => {
  test('DM menu contains full organization + privacy + delete set', () => {
    const items = buildConversationMenuItems({
      isStarred: false,
      isMuted: false,
      isArchived: false,
      label: 'other',
      isGroup: false,
      isDm: true
    });
    const ids = items.map((i) => i.id);
    assert.ok(ids.includes('move_other'));
    assert.ok(ids.includes('label_jobs'));
    assert.ok(ids.includes('toggle_star'));
    assert.ok(ids.includes('mark_unread'));
    assert.ok(ids.includes('archive'));
    assert.ok(ids.includes('toggle_mute'));
    assert.ok(ids.includes('manage_settings'));
    assert.ok(ids.includes('report_block'));
    assert.ok(ids.includes('delete'));

    const groups = groupMenuItemsBySection(items);
    const labels = groups.map((g) => g.label).filter(Boolean);
    assert.ok(labels.includes('Organization'));
    assert.ok(labels.includes('Notifications'));
    assert.ok(labels.includes('Privacy and safety'));
  });

  test('ConversationActionsMenu portals mobile sheet to document.body', () => {
    const src = read('src/components/messaging/ConversationActionsMenu.tsx');
    assert.match(src, /createPortal/);
    assert.match(src, /document\.body/);
    assert.match(src, /z-\[400\]/);
    assert.match(src, /data-mobile-sheet/);
    assert.match(src, /messages-menu-section-/);
    assert.match(src, /messages-conversation-menu-scroll/);
  });

  test('Messages.tsx uses ConversationActionsMenu with mobile sheet', () => {
    const src = read('src/messages/Messages.tsx');
    assert.match(src, /ConversationActionsMenu/);
    assert.match(src, /useMobileSheet=\{Boolean\(isMobileViewport \|\| isMobileConversationMode\)\}/);
    assert.doesNotMatch(src, /absolute right-0 top-11 z-20 max-h-\[min\(70vh/);
  });
});
