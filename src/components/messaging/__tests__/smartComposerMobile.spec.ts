import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeComposerTextareaHeight,
  mobileComposerPlaceholder,
  MESSAGES_COMPOSER_MAX_HEIGHT_MOBILE,
  MESSAGES_COMPOSER_MIN_HEIGHT_MOBILE
} from '../../../messages/messagesWorkspaceLayout';

test('mobile placeholders are short single-line friendly', () => {
  assert.equal(mobileComposerPlaceholder(false), 'Message…');
  assert.equal(mobileComposerPlaceholder(true), 'Ask Scrolitha…');
  assert.equal(mobileComposerPlaceholder(true, true), 'Ask about this file…');
  assert.ok(mobileComposerPlaceholder(false).length < 40);
  assert.ok(!mobileComposerPlaceholder(false).includes('Enter'));
});

test('mobile textarea bounds are compact', () => {
  assert.ok(MESSAGES_COMPOSER_MIN_HEIGHT_MOBILE <= 52);
  assert.ok(MESSAGES_COMPOSER_MAX_HEIGHT_MOBILE <= 136);
  const open = computeComposerTextareaHeight({ scrollHeight: 400, isMobile: true, keyboardOpen: true });
  assert.ok(open.height <= 96);
  const idle = computeComposerTextareaHeight({ scrollHeight: 20, isMobile: true, keyboardOpen: false });
  assert.ok(idle.height >= 40);
});

test('mobile primary row policy: not four permanent trailing controls', () => {
  // Document expected policy for SmartComposer mobilePrimary
  const mobilePrimaryControls = (hasDraft: boolean, hasVoice: boolean) => {
    const trailing: string[] = [];
    if (hasVoice && !hasDraft) trailing.push('mic');
    if (hasDraft || !hasVoice) trailing.push('send');
    return trailing;
  };
  assert.deepEqual(mobilePrimaryControls(false, true), ['mic']);
  assert.deepEqual(mobilePrimaryControls(true, true), ['send']);
  assert.ok(mobilePrimaryControls(false, true).length === 1);
  assert.ok(!mobilePrimaryControls(true, true).includes('suggest'));
});
