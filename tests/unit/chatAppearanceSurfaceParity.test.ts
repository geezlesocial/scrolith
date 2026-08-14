import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const controller = () => read('src/components/messaging/useConversationAppearance.ts');
const windowSource = () => read('src/components/messaging/MessagingChatWindow.tsx');
const header = () => read('src/components/messaging/HeaderMessagesPopover.tsx');
const messages = () => read('src/messages/Messages.tsx');

test('full Messages appearance remains on the shared controller', () => {
  assert.match(messages(), /useConversationAppearance/);
  assert.doesNotMatch(messages(), /MessagingService\.getChatAppearance\(/);
});

test('floating widget hydrates the selected conversation appearance', () => {
  assert.match(windowSource(), /useConversationAppearance\(\{/);
  assert.match(windowSource(), /conversationId,/);
});

test('floating widget exposes the shared appearance editor', () => {
  assert.match(windowSource(), /data-testid="chat-appearance-open"/);
  assert.match(windowSource(), /<ChatAppearancePanel/);
});

test('floating widget saves through the existing panel contract', () => {
  assert.match(windowSource(), /onSaved=\{\(next\) =>/);
  assert.match(windowSource(), /setAppearance\(next/);
});

test('header-launched desktop chat uses the dock conversation window', () => {
  assert.match(header(), /openConversationInDock\(idSafe, \{ expandDock: true \}\)/);
  assert.match(header(), /navigate\(buildMessagesConversationPath\(idSafe\)/);
});

test('header-launched chat can open the same editor', () => {
  assert.match(windowSource(), /aria-label="Chat appearance"/);
  assert.match(windowSource(), /data-testid="chat-appearance-open"/);
});

test('appearance cache is scoped by user and conversation', () => {
  assert.match(controller(), /const cacheKey = `\$\{viewerId \|\| 'anonymous'\}:\$\{id\}`/);
  assert.match(controller(), /cacheAppearance\(`\$\{subscriber\.userId\}:\$\{subscriber\.conversationId\}`/);
});

test('switching conversations resets before loading and guards stale responses', () => {
  assert.match(controller(), /setAppearanceState\(\{ \.\.\.EMPTY_APPEARANCE \}\)/);
  assert.match(controller(), /generationRef\.current === generation/);
  assert.match(controller(), /membership === 'not-member'/);
});

test('reopening a widget can restore the in-memory persisted appearance', () => {
  assert.match(controller(), /const cached = appearanceCache\.get\(cacheKey\)/);
  assert.match(controller(), /setAppearanceState\(cached\)/);
});

test('realtime updates apply only to the matching conversation and viewer', () => {
  assert.match(controller(), /const id = String\(payload\?\.conversationId/);
  assert.match(controller(), /registry\?\.subscribers\.get\(id\)/);
  assert.match(controller(), /actorId && subscriber\.userId && actorId !== subscriber\.userId/);
});

test('partial preview participants do not suppress the authoritative appearance read', () => {
  assert.match(controller(), /const includesViewer = parts\.some/);
  assert.match(controller(), /if \(!includesViewer\) return 'unknown'/);
  assert.match(controller(), /backend still enforces conversation membership/);
});

test('transient appearance failures are retryable and never cached as blank state', () => {
  const source = controller();
  assert.match(source, /transient auth\/metadata failure/);
  assert.doesNotMatch(
    source,
    /\.catch\(\(\) => \{[\s\S]*?cacheAppearance\(key, next\);[\s\S]*?return \{ \.\.\.EMPTY_APPEARANCE \};/
  );
});

test('appearance lifecycle remains mounted across Strict Mode effect replay', () => {
  const source = controller();
  assert.match(source, /mountedRef\.current = true/);
  assert.match(source, /mountedRef\.current = false/);
});

test('all appearance surfaces render the shared hydrated style', () => {
  const floatingSource = windowSource();
  const fullMessages = messages();
  assert.match(floatingSource, /data-testid="chat-thread-surface"/);
  assert.match(floatingSource, /style=\{chatSurfaceStyle\}/);
  assert.match(fullMessages, /data-testid="messages-history-viewport"/);
  assert.match(fullMessages, /style=\{chatSurfaceStyle\}/);
  assert.match(header(), /openConversationInDock\(idSafe, \{ expandDock: true \}\)/);
});

test('duplicate surfaces share one socket listener per socket', () => {
  assert.match(controller(), /const socketRegistries = new WeakMap/);
  assert.match(controller(), /socketRegistries\.set\(socket, registry\)/);
  assert.match(controller(), /socketRegistries\.get\(socket\)/);
});

test('editor portal, Escape, focus trap, and viewport behavior remain intact', () => {
  const panel = read('src/components/messaging/ChatAppearancePanel.tsx');
  assert.match(panel, /createPortal/);
  assert.match(panel, /event\.key === 'Escape'/);
  assert.match(panel, /max-h-\[90vh\]/);
  assert.match(panel, /previousFocusRef/);
});

test('guest critical path keeps heavy messaging UI lazy', () => {
  const app = read('src/App.tsx');
  assert.match(app, /lazy\(\(\) => import\('\.\/components\/messaging\/DesktopMessagingDock'\)\)/);
  assert.doesNotMatch(app, /import .*ChatAppearancePanel/);
});
