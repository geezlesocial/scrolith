import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decideMessagingFallbackPolling as decidePoll,
  MESSAGING_POLL_GRACE_MS as GRACE,
  MESSAGING_POLL_GRACE_MS
} from '../../src/services/messagingEngine/pollingPolicy';
import { reconcileOptimisticMessage as reconcile } from '../../src/services/messagingSurfaces';
import { buildClientSendId } from '../../src/services/messagingComposer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

test('provider tree: SocketProvider wraps NotificationProvider in App.tsx', () => {
  const app = read('src/App.tsx');
  const socketIdx = app.indexOf('<SocketProvider>');
  const notifIdx = app.indexOf('<NotificationProvider>');
  const socketClose = app.indexOf('</SocketProvider>');
  const notifClose = app.indexOf('</NotificationProvider>');
  assert.ok(socketIdx >= 0, 'SocketProvider open missing');
  assert.ok(notifIdx >= 0, 'NotificationProvider open missing');
  assert.ok(socketIdx < notifIdx, 'SocketProvider must open before NotificationProvider');
  assert.ok(notifClose >= 0 && socketClose > notifClose, 'NotificationProvider must close before SocketProvider');
});

test('AuthenticatedRuntimeProviders does not nest a second SocketProvider', () => {
  const src = read('src/context/AuthenticatedRuntimeProviders.tsx');
  assert.equal(src.includes('<SocketProvider'), false);
  assert.equal(src.includes('from \'./SocketContext\''), false);
  assert.ok(src.includes('RealtimeProvider'));
  assert.ok(src.includes('MessageProvider'));
});

test('exactly one SocketProvider mount site in App + no nested auth socket', () => {
  const app = read('src/App.tsx');
  const opens = (app.match(/<SocketProvider>/g) || []).length;
  assert.equal(opens, 1);
  const auth = read('src/context/AuthenticatedRuntimeProviders.tsx');
  assert.equal((auth.match(/<SocketProvider/g) || []).length, 0);
});

test('RealtimeProvider no longer fetches or discards getAllConversations on messages:new', () => {
  const src = read('src/dashboard/shared/RealtimeProvider.tsx');
  // No live call/import of MessagingService for conversation lists.
  assert.equal(/import\s*\{[^}]*MessagingService/.test(src), false);
  assert.equal(src.includes("socket.on('messages:new'"), false);
  assert.ok(src.includes('MessageContext owns') || src.includes('MessageContext only'));
});

test('SocketContext retains socket identity on brief disconnect', () => {
  const src = read('src/context/SocketContext.tsx');
  assert.ok(src.includes('connectionHealth'));
  assert.ok(src.includes('Do NOT clear socket to null on brief disconnects'));
  assert.ok(src.includes("setConnectionHealth(hasEverConnectedRef.current ? 'reconnecting'"));
});

test('polling policy: healthy socket never polls; grace blocks reconnect blips', () => {
  const healthy = decidePoll({
    health: 'connected',
    isOnline: true,
    disconnectedSince: null
  });
  assert.equal(healthy.shouldPoll, false);

  const offline = decidePoll({
    health: 'offline',
    isOnline: false,
    disconnectedSince: Date.now()
  });
  assert.equal(offline.shouldPoll, false);

  const grace = decidePoll({
    health: 'reconnecting',
    isOnline: true,
    disconnectedSince: Date.now() - 1000,
    now: Date.now()
  });
  assert.equal(grace.shouldPoll, false);
  assert.equal(grace.reason, 'grace_period');
  assert.ok(GRACE >= 1000);

  const afterGrace = decidePoll({
    health: 'disconnected',
    isOnline: true,
    disconnectedSince: Date.now() - (MESSAGING_POLL_GRACE_MS + 5_000),
    now: Date.now()
  });
  assert.equal(afterGrace.shouldPoll, true);

  const hidden = decidePoll({
    health: 'disconnected',
    isOnline: true,
    disconnectedSince: Date.now() - 60_000,
    tabHidden: true
  });
  assert.equal(hidden.shouldPoll, false);
});

test('full-page send reconcile: socket-first then API', () => {
  const clientSendId = buildClientSendId('c1', 100);
  const optimistic = {
    id: clientSendId,
    text: 'hello',
    senderId: 'u1',
    metadata: { clientSendId }
  } as any;
  const socketEcho = {
    id: 'server_1',
    text: 'hello',
    senderId: 'u1',
    metadata: { clientSendId }
  } as any;
  const afterSocket = reconcile([optimistic], socketEcho);
  assert.equal(afterSocket.length, 1);
  assert.equal(afterSocket[0].id, 'server_1');

  const apiResponse = {
    id: 'server_1',
    text: 'hello',
    senderId: 'u1',
    metadata: { clientSendId }
  } as any;
  const afterApi = reconcile(afterSocket, apiResponse);
  assert.equal(afterApi.length, 1);
  assert.equal(afterApi[0].id, 'server_1');
});

test('full-page send reconcile: API-first then socket', () => {
  const clientSendId = buildClientSendId('c1', 200);
  const optimistic = {
    id: clientSendId,
    text: 'yo',
    senderId: 'u1',
    metadata: { clientSendId }
  } as any;
  const api = {
    id: 'server_2',
    text: 'yo',
    senderId: 'u1',
    metadata: { clientSendId }
  } as any;
  const afterApi = reconcile([optimistic], api);
  assert.equal(afterApi.length, 1);
  const socket = {
    id: 'server_2',
    text: 'yo',
    senderId: 'u1',
    metadata: { clientSendId }
  } as any;
  const afterSocket = reconcile(afterApi, socket);
  assert.equal(afterSocket.length, 1);
});

test('Messages.tsx send path uses clientSendId and reconcileOptimisticMessage', () => {
  const src = read('src/messages/Messages.tsx');
  assert.ok(src.includes('buildClientSendId'));
  assert.ok(src.includes('reconcileOptimisticMessage'));
  assert.ok(src.includes('trackOutgoingMessage'));
  assert.ok(src.includes('connectionHealth'));
  assert.ok(src.includes('Healthy sockets rely on event-driven'));
});

test('GigDetail registers visible conversation for open chat', () => {
  const src = read('src/main/GigDetail.tsx');
  assert.ok(src.includes('registerVisibleConversation'));
  assert.ok(src.includes('unregisterVisibleConversation'));
  assert.ok(src.includes('useMessages'));
});

test('MessageContext polling uses health policy not socket null alone', () => {
  const src = read('src/context/MessageContext.tsx');
  assert.ok(src.includes('decideMessagingFallbackPolling'));
  assert.ok(src.includes('MESSAGING_POLL_GRACE_MS'));
  assert.ok(src.includes('connectionHealth'));
});

test('call overlay stays above message detail routes and remote audio is feedback-limited', () => {
  const shell = read('src/messages/GlobalVoiceCallShell.tsx');
  const modal = read('src/messages/VoiceCallModal.tsx');
  const app = read('src/App.tsx');

  assert.ok(app.includes('path="/messages/:conversationId"'), 'message detail route must keep using the shared Messages surface');
  assert.ok(shell.includes('z-[9999]'), 'minimized active-call overlay must sit above inbox/detail chrome');
  assert.ok(modal.includes('z-[9998]'), 'full call screen must sit above inbox/detail chrome');
  assert.ok(modal.includes('el.volume = speakerOn ? 0.82 : 0'), 'remote audio should be capped below 100% to reduce same-room feedback');
  assert.ok(modal.includes('el.disableRemotePlayback = true'), 'remote audio sink should stay local and explicit');
});

test('voice/video calls use mobile-friendly WebRTC and microphone constraints', () => {
  const provider = read('src/messages/VoiceCallProvider.tsx');
  const constraints = read('src/messages/callMediaConstraints.ts');

  assert.ok(provider.includes("bundlePolicy: 'max-bundle'"));
  assert.ok(provider.includes("rtcpMuxPolicy: 'require'"));
  assert.ok(provider.includes('iceCandidatePoolSize: 4'));
  assert.ok(constraints.includes('echoCancellation: { ideal: true }'));
  assert.ok(constraints.includes('noiseSuppression: { ideal: true }'));
  assert.ok(constraints.includes('autoGainControl: { ideal: true }'));
  assert.ok(constraints.includes('channelCount: { ideal: 1 }'));
});
