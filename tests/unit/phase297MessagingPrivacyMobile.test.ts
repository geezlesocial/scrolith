/**
 * Phase 29.7 — Message Privacy mobile/WebView stacking and entry points.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('Phase 29.7 messaging privacy mobile fix', () => {
  test('settings dialog stacks above mobile conversation shell (z-80)', () => {
    const src = read('src/messages/Messages.tsx');
    assert.match(src, /z-\[80\]/);
    assert.match(src, /zIndexClassName=["']z-\[200\]["']/);
    assert.match(src, /openMessagingPrivacySettings/);
    assert.match(src, /messages-inbox-privacy-btn/);
    assert.match(src, /messages-conversation-menu-backdrop/);
    // Privacy action must not require actionBusy gate
    assert.match(src, /action === 'manage_settings'/);
    assert.match(src, /openMessagingPrivacySettings\('privacy'\)/);
  });

  test('mobile conversation menu uses fixed sheet above conversation', () => {
    const src = read('src/messages/Messages.tsx');
    assert.match(src, /z-\[160\]/);
    assert.match(src, /isMobileViewport \? \(/);
  });

  test('privacy panel has touch-friendly controls', () => {
    const panel = read('src/components/messaging/MessagingPrivacySettingsPanel.tsx');
    assert.match(panel, /touch-manipulation/);
    assert.match(panel, /min-h-11/);
    assert.match(panel, /messaging-privacy-panel/);
  });

  test('group overlays stack above mobile conversation', () => {
    const manage = read('src/components/messaging/GroupManagePanel.tsx');
    const wizard = read('src/components/messaging/GroupCreateWizard.tsx');
    assert.match(manage, /z-\[180\]/);
    assert.match(wizard, /z-\[190\]/);
  });

  test('last-seen presence renders on mobile when privacy allows', () => {
    const src = read('src/messages/Messages.tsx');
    assert.match(src, /messages-presence-last-seen/);
    // Must not gate last-seen solely behind !isMobileViewport
    assert.doesNotMatch(
      src,
      /!isMobileViewport && otherLastSeen/
    );
  });
});
