import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNativeNotificationEnvelope,
  isSafeInternalPath
} from '../../src/mobile/nativeBridge';

test('native notification envelope is bounded and strips unsafe metadata', () => {
  const envelope = buildNativeNotificationEnvelope([
    {
      id: 'n1',
      type: 'message',
      title: 'A'.repeat(300),
      body: 'B'.repeat(1000),
      isRead: false,
      actionUrl: 'https://attacker.example/steal',
      metadata: { secret: 'must not cross bridge' }
    },
    ...Array.from({ length: 45 }, (_, index) => ({ id: `n-${index}`, title: 'More' }))
  ], 'request-1');

  assert.equal(envelope.bridgeVersion, '2');
  assert.equal(envelope.requestId, 'request-1');
  assert.equal(envelope.items.length, 40);
  assert.equal(envelope.items[0].title.length, 160);
  assert.equal(envelope.items[0].message.length, 600);
  assert.equal('metadata' in envelope.items[0], false);
  assert.equal('actionPath' in envelope.items[0], false);
  assert.equal(envelope.hasMore, true);
});

test('native notification paths accept only internal paths', () => {
  assert.equal(isSafeInternalPath('/messages/c1'), true);
  assert.equal(isSafeInternalPath('/notifications?category=messages'), true);
  assert.equal(isSafeInternalPath('https://scrolith.com/messages/c1'), false);
  assert.equal(isSafeInternalPath('//attacker.example'), false);
  assert.equal(isSafeInternalPath('/javascript:alert(1)'), false);
});
