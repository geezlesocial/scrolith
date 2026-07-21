/**
 * Phase 29.3 — frontend group messaging UX unit tests
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('Phase 29.3 group messaging UX', () => {
  test('GroupCreateWizard is multi-step and uses enterprise create API', () => {
    const src = read('src/components/messaging/GroupCreateWizard.tsx');
    assert.match(src, /group-create-wizard/);
    assert.match(src, /createEnterpriseGroup/);
    assert.match(src, /wizard-step-identity/);
    assert.match(src, /wizard-step-privacy/);
    assert.match(src, /wizard-step-joining/);
    assert.match(src, /wizard-step-permissions/);
    assert.match(src, /wizard-step-content/);
    assert.match(src, /wizard-step-review/);
    assert.match(src, /SECRET/);
    assert.match(src, /INVITE_ONLY/);
  });

  test('GroupManagePanel has enterprise tabs', () => {
    const src = read('src/components/messaging/GroupManagePanel.tsx');
    assert.match(src, /group-tab-\$\{t\.id\}/);
    assert.match(src, /id: 'general'/);
    assert.match(src, /id: 'members'/);
    assert.match(src, /id: 'invites'/);
    assert.match(src, /id: 'requests'/);
    assert.match(src, /id: 'restrictions'/);
    assert.match(src, /id: 'danger'/);
    assert.match(src, /listGroupJoinRequests/);
    assert.match(src, /lockGroup/);
  });

  test('MessagingService exposes enterprise group APIs', () => {
    const src = read('src/services/messaging.ts');
    assert.match(src, /createEnterpriseGroup/);
    assert.match(src, /getEnterpriseGroup/);
    assert.match(src, /listGroupPins/);
    assert.match(src, /getGroupCatchup/);
    assert.match(src, /decideGroupJoinRequest/);
    // DM create path preserved
    assert.match(src, /createConversation/);
  });

  test('Messages integrates wizard and group banners without removing DM paths', () => {
    const src = read('src/messages/Messages.tsx');
    assert.match(src, /GroupCreateWizard/);
    assert.match(src, /group-pins-banner/);
    assert.match(src, /group-composer-restriction/);
    assert.match(src, /formatMultiTyperLabel/);
    assert.match(src, /messages:group:join/);
    assert.match(src, /isActiveScrolithaConversation/);
    assert.match(src, /SmartComposer/);
    assert.match(src, /MessagingService\./);
    // DM send path preserved
    assert.match(src, /handleSendMessage/);
  });

  test('UX helpers module exports restriction + multi-typer', () => {
    const src = read('src/utils/groupMessagingUx.ts');
    assert.match(src, /formatMultiTyperLabel/);
    assert.match(src, /resolveGroupComposerRestriction/);
    assert.match(src, /VISIBILITY_HELP/);
  });
});
