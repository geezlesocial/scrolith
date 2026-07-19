import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Lightweight policy fixtures for Phase 20.7.8 menu selection.
 * UI binding is in ScrolithaConversationMenu + Messages.tsx isActiveScrolithaConversation.
 */

const SCROLITHA_MENU_IDS = ['accuracy', 'media_files', 'verify_e2ee'] as const;

const HUMAN_PEER_MENU_IDS = [
  'move_other',
  'label_jobs',
  'mark_unread',
  'toggle_star',
  'toggle_mute',
  'archive',
  'report_block',
  'delete',
  'manage_settings'
] as const;

const resolveMenuKind = (conversation: {
  isScrolitha?: boolean;
  is_scrolitha?: boolean;
  participants?: Array<{ isScrolitha?: boolean; is_scrolitha?: boolean; username?: string }>;
}) => {
  // Trusted server flags only — never name/avatar alone
  if (conversation.isScrolitha || conversation.is_scrolitha) return 'scrolitha';
  if (conversation.participants?.some((p) => p.isScrolitha || p.is_scrolitha)) return 'scrolitha';
  return 'human';
};

test('Scrolitha conversation selects system menu', () => {
  assert.equal(resolveMenuKind({ isScrolitha: true }), 'scrolitha');
  assert.equal(
    resolveMenuKind({
      is_scrolitha: false,
      participants: [{ isScrolitha: true, username: 'scrolitha' }]
    }),
    'scrolitha'
  );
});

test('human conversation keeps peer menu', () => {
  assert.equal(
    resolveMenuKind({
      isScrolitha: false,
      participants: [{ username: 'alice', isScrolitha: false }]
    }),
    'human'
  );
});

test('impersonating display name alone is not enough', () => {
  assert.equal(
    resolveMenuKind({
      isScrolitha: false,
      is_scrolitha: false,
      participants: [{ username: 'scrolitha', isScrolitha: false, is_scrolitha: false }]
    }),
    'human'
  );
});

test('menu item inventories do not overlap destructively', () => {
  for (const id of SCROLITHA_MENU_IDS) {
    assert.equal((HUMAN_PEER_MENU_IDS as readonly string[]).includes(id), false);
  }
  assert.ok(SCROLITHA_MENU_IDS.includes('accuracy'));
  assert.ok(SCROLITHA_MENU_IDS.includes('verify_e2ee'));
  assert.ok(HUMAN_PEER_MENU_IDS.includes('delete'));
  assert.ok(HUMAN_PEER_MENU_IDS.includes('report_block'));
});
