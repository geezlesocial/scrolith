import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMemberHomeDeveloperWidgetVisibility,
  isMemberHomeDeveloperWidgetPath,
  MEMBER_HOME_DEVELOPER_WIDGET_DISMISSED_KEY,
  MEMBER_HOME_DEVELOPER_WIDGET_SHOWN_AT_KEY,
  MEMBER_HOME_DEVELOPER_WIDGET_TTL_MS
} from '../../src/components/member-home/memberHomeDeveloperWidget';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values
  };
};

test('developer widget is restricted to the exact member-home route', () => {
  assert.equal(isMemberHomeDeveloperWidgetPath('/member-home'), true);
  assert.equal(isMemberHomeDeveloperWidgetPath('/member-home/'), true);
  assert.equal(isMemberHomeDeveloperWidgetPath('/'), false);
  assert.equal(isMemberHomeDeveloperWidgetPath('/home'), false);
  assert.equal(isMemberHomeDeveloperWidgetPath('/m/home'), false);
  assert.equal(isMemberHomeDeveloperWidgetPath('/community'), false);
});

test('developer widget starts a ten-minute session window and dismisses it', () => {
  const storage = createStorage();
  const startedAt = 1_000_000;

  const initial = getMemberHomeDeveloperWidgetVisibility(storage, startedAt);
  assert.deepEqual(initial, {
    visible: true,
    remainingMs: MEMBER_HOME_DEVELOPER_WIDGET_TTL_MS
  });
  assert.equal(storage.values.get(MEMBER_HOME_DEVELOPER_WIDGET_SHOWN_AT_KEY), String(startedAt));

  const expired = getMemberHomeDeveloperWidgetVisibility(
    storage,
    startedAt + MEMBER_HOME_DEVELOPER_WIDGET_TTL_MS
  );
  assert.deepEqual(expired, { visible: false, remainingMs: 0 });
  assert.equal(storage.values.get(MEMBER_HOME_DEVELOPER_WIDGET_DISMISSED_KEY), '1');
  assert.deepEqual(getMemberHomeDeveloperWidgetVisibility(storage, startedAt + 1), {
    visible: false,
    remainingMs: 0
  });
});

test('developer widget handles storage failures without breaking rendering', () => {
  const storage = {
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: () => {
      throw new Error('storage unavailable');
    }
  };

  assert.deepEqual(getMemberHomeDeveloperWidgetVisibility(storage, 2_000_000), {
    visible: true,
    remainingMs: MEMBER_HOME_DEVELOPER_WIDGET_TTL_MS
  });
});
