import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decideIncomingDescription,
  resolveNegotiationRole,
  shouldDropIceCandidate
} from '../../src/messages/callNegotiation';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('chat appearance has one hydration owner and guarded realtime scope', () => {
  const panel = read('src/components/messaging/ChatAppearancePanel.tsx');
  const messages = read('src/messages/Messages.tsx');

  assert.equal((panel.match(/getChatAppearance\s*\(/g) || []).length, 0);
  assert.ok(messages.includes('chatAppearanceRequestRef'));
  assert.ok(messages.includes('activeConvoIdRef.current === conversationId'));
  assert.ok(messages.includes('payload?.participantId'));
  assert.ok(panel.includes('createPortal'));
  assert.ok(panel.includes("event.key === 'Escape'"));
  assert.ok(panel.includes("onPointerUp={() => commitSlider('opacity')}"));
  assert.ok(panel.includes("onKeyUp={(event) => {"));
});

test('call listeners are lifecycle-scoped and media state uses exact cleanup', () => {
  const provider = read('src/messages/VoiceCallProvider.tsx');

  assert.ok(provider.includes('const callGenerationRef = useRef(0)'));
  assert.ok(provider.includes('if (!matchesCurrentCall(payload)) return;'));
  assert.ok(provider.includes("socket.on('call:media', onMediaState)"));
  assert.ok(provider.includes("socket.off('call:media', onMediaState)"));
  assert.ok(provider.includes("socket.on('messenger:call_started', onRinging)"));
  assert.ok(provider.includes("socket.off('messenger:call_started', onRinging)"));
  assert.ok(provider.includes('acceptingCallIdRef.current === callId'));
  assert.ok(provider.includes('endingCallIdRef.current === callId'));
  assert.ok(provider.includes('setReconnecting(true)'));
  assert.ok(provider.includes('window.setTimeout(() => {'));
});

test('perfect negotiation guards preserve answer, glare, and early ICE behavior', () => {
  assert.equal(resolveNegotiationRole('user-a', 'user-b'), 'impolite');
  assert.equal(resolveNegotiationRole('user-b', 'user-a'), 'polite');
  assert.deepEqual(
    decideIncomingDescription({
      descriptionType: 'answer',
      signalingState: 'have-local-offer',
      makingOffer: true,
      isPolite: false
    }),
    { action: 'accept' }
  );
  assert.deepEqual(
    decideIncomingDescription({
      descriptionType: 'offer',
      signalingState: 'have-local-offer',
      makingOffer: true,
      isPolite: false
    }),
    { action: 'ignore' }
  );
  assert.equal(shouldDropIceCandidate({ makingOffer: false, ignoreOffer: true, isSettingRemoteAnswerPending: false }), true);
});
