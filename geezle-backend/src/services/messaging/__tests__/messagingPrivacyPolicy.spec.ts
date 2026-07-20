/**
 * Phase 22.3B — pure unit tests for messaging privacy policy helpers.
 * Does not require a live database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGING_PRIVACY_DEFAULTS,
  normalizePrivacyAudience,
  normalizeDmAudience,
  settingsFromUserRow
} from '../messagingPrivacyPolicy';

test('normalizePrivacyAudience accepts known values and falls back', () => {
  assert.equal(normalizePrivacyAudience('EVERYONE'), 'EVERYONE');
  assert.equal(normalizePrivacyAudience('contacts'), 'CONTACTS');
  assert.equal(normalizePrivacyAudience('nobody'), 'NOBODY');
  assert.equal(normalizePrivacyAudience('bogus'), 'EVERYONE');
  assert.equal(normalizePrivacyAudience(null, 'CONTACTS'), 'CONTACTS');
});

test('normalizeDmAudience includes FOLLOWERS', () => {
  assert.equal(normalizeDmAudience('FOLLOWERS'), 'FOLLOWERS');
  assert.equal(normalizeDmAudience('followers'), 'FOLLOWERS');
  assert.equal(normalizeDmAudience('invalid'), 'EVERYONE');
});

test('settingsFromUserRow maps presenceVisibility to onlineStatusVisibility', () => {
  const settings = settingsFromUserRow({
    presenceVisibility: 'CONTACTS',
    lastSeenVisibility: 'NOBODY',
    readReceiptsEnabled: false,
    typingIndicatorsEnabled: true,
    recordingIndicatorsEnabled: false,
    directMessageAudience: 'FOLLOWERS',
    groupInviteAudience: 'CONTACTS',
    notificationMessagePreviewEnabled: false,
    messagingPrivacyUpdatedAt: new Date('2026-07-20T12:00:00.000Z')
  });
  assert.equal(settings.onlineStatusVisibility, 'CONTACTS');
  assert.equal(settings.lastSeenVisibility, 'NOBODY');
  assert.equal(settings.readReceiptsEnabled, false);
  assert.equal(settings.typingIndicatorsEnabled, true);
  assert.equal(settings.recordingIndicatorsEnabled, false);
  assert.equal(settings.directMessageAudience, 'FOLLOWERS');
  assert.equal(settings.groupInviteAudience, 'CONTACTS');
  assert.equal(settings.notificationMessagePreviewEnabled, false);
  assert.ok(settings.updatedAt);
});

test('settingsFromUserRow defaults preserve production-safe behavior', () => {
  const empty = settingsFromUserRow(null);
  assert.deepEqual(
    {
      onlineStatusVisibility: empty.onlineStatusVisibility,
      lastSeenVisibility: empty.lastSeenVisibility,
      readReceiptsEnabled: empty.readReceiptsEnabled,
      typingIndicatorsEnabled: empty.typingIndicatorsEnabled,
      recordingIndicatorsEnabled: empty.recordingIndicatorsEnabled,
      directMessageAudience: empty.directMessageAudience,
      groupInviteAudience: empty.groupInviteAudience,
      notificationMessagePreviewEnabled: empty.notificationMessagePreviewEnabled
    },
    {
      onlineStatusVisibility: MESSAGING_PRIVACY_DEFAULTS.onlineStatusVisibility,
      lastSeenVisibility: MESSAGING_PRIVACY_DEFAULTS.lastSeenVisibility,
      readReceiptsEnabled: MESSAGING_PRIVACY_DEFAULTS.readReceiptsEnabled,
      typingIndicatorsEnabled: MESSAGING_PRIVACY_DEFAULTS.typingIndicatorsEnabled,
      recordingIndicatorsEnabled: MESSAGING_PRIVACY_DEFAULTS.recordingIndicatorsEnabled,
      directMessageAudience: MESSAGING_PRIVACY_DEFAULTS.directMessageAudience,
      groupInviteAudience: MESSAGING_PRIVACY_DEFAULTS.groupInviteAudience,
      notificationMessagePreviewEnabled: MESSAGING_PRIVACY_DEFAULTS.notificationMessagePreviewEnabled
    }
  );
});

test('undefined boolean privacy flags default to enabled (legacy rows)', () => {
  const settings = settingsFromUserRow({
    presenceVisibility: 'EVERYONE'
  });
  assert.equal(settings.readReceiptsEnabled, true);
  assert.equal(settings.typingIndicatorsEnabled, true);
  assert.equal(settings.recordingIndicatorsEnabled, true);
  assert.equal(settings.notificationMessagePreviewEnabled, true);
});

test('explicit false disables indicator flags', () => {
  const settings = settingsFromUserRow({
    readReceiptsEnabled: false,
    typingIndicatorsEnabled: false,
    recordingIndicatorsEnabled: false,
    notificationMessagePreviewEnabled: false
  });
  assert.equal(settings.readReceiptsEnabled, false);
  assert.equal(settings.typingIndicatorsEnabled, false);
  assert.equal(settings.recordingIndicatorsEnabled, false);
  assert.equal(settings.notificationMessagePreviewEnabled, false);
});
