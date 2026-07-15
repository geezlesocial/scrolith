/**
 * Phase 6.2 / 6.2.1 — compact + adaptive desktop messaging dock contracts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatMessagingBadgeCount,
  messagingDockRectsIntersect,
  MESSAGING_DOCK_COLLAPSED_HEIGHT_PX,
  MESSAGING_DOCK_COLLAPSED_MAX_WIDTH_PX,
  MESSAGING_DOCK_COLLAPSED_MIN_WIDTH_PX,
  MESSAGING_DOCK_COMPACT_HEIGHT_PX,
  MESSAGING_DOCK_COMPACT_WIDTH_PX,
  MESSAGING_DOCK_EDGE_OFFSET_PX,
  MESSAGING_DOCK_ICON_SIZE_PX,
  resolveMessagingDockPlacement
} from '../../src/services/messagingSurfaces.ts';
import { readBlockingOverlayActive } from '../../src/components/messaging/useBlockingOverlayActive.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const dockSrc = read('src/components/messaging/DesktopMessagingDock.tsx');
const overlaySrc = read('src/components/messaging/useBlockingOverlayActive.ts');
const composerClasses = read('src/components/composer/composerClasses.ts');

test('collapsed dock footprint tokens stay in compact enterprise range', () => {
  assert.ok(
    MESSAGING_DOCK_COLLAPSED_MAX_WIDTH_PX >= 240 && MESSAGING_DOCK_COLLAPSED_MAX_WIDTH_PX <= 290
  );
  assert.ok(MESSAGING_DOCK_COLLAPSED_MIN_WIDTH_PX <= MESSAGING_DOCK_COLLAPSED_MAX_WIDTH_PX);
  assert.ok(MESSAGING_DOCK_COLLAPSED_HEIGHT_PX >= 44 && MESSAGING_DOCK_COLLAPSED_HEIGHT_PX <= 52);
  assert.ok(MESSAGING_DOCK_COMPACT_WIDTH_PX >= 210 && MESSAGING_DOCK_COMPACT_WIDTH_PX <= 240);
  assert.ok(MESSAGING_DOCK_COMPACT_HEIGHT_PX >= 44 && MESSAGING_DOCK_COMPACT_HEIGHT_PX <= 48);
  assert.ok(MESSAGING_DOCK_ICON_SIZE_PX >= 44 && MESSAGING_DOCK_ICON_SIZE_PX <= 52);
  assert.ok(MESSAGING_DOCK_EDGE_OFFSET_PX >= 12 && MESSAGING_DOCK_EDGE_OFFSET_PX <= 24);
});

test('placement: normal bottom-right when no modal', () => {
  const p = resolveMessagingDockPlacement({
    viewportWidth: 1440,
    viewportHeight: 900,
    modal: null
  });
  assert.equal(p.mode, 'normal');
  assert.equal(p.bottom, MESSAGING_DOCK_EDGE_OFFSET_PX);
  assert.equal(p.right, MESSAGING_DOCK_EDGE_OFFSET_PX);
  assert.equal(p.width, MESSAGING_DOCK_COLLAPSED_MAX_WIDTH_PX);
  assert.equal(p.height, MESSAGING_DOCK_COLLAPSED_HEIGHT_PX);
});

test('placement: avoids centered modal at bottom-right by relocating', () => {
  const modal = {
    top: 120,
    left: 360,
    right: 1080,
    bottom: 780,
    width: 720,
    height: 660
  };
  const p = resolveMessagingDockPlacement({
    viewportWidth: 1440,
    viewportHeight: 900,
    modal
  });
  assert.notEqual(p.mode, 'hidden');
  // Dock rect must not intersect modal with preferred gap
  const left = 1440 - p.right - p.width;
  const top = 900 - p.bottom - p.height;
  const dock = {
    top,
    left,
    right: left + p.width,
    bottom: top + p.height,
    width: p.width,
    height: p.height
  };
  assert.equal(messagingDockRectsIntersect(dock, modal, 12), false);
});

test('placement: icon-only or compact preferred before hidden for tight viewports', () => {
  const modal = {
    top: 40,
    left: 40,
    right: 980,
    bottom: 740,
    width: 940,
    height: 700
  };
  const p = resolveMessagingDockPlacement({
    viewportWidth: 1024,
    viewportHeight: 768,
    modal
  });
  assert.ok(['normal', 'compact', 'icon-only', 'hidden'].includes(p.mode));
  if (p.mode !== 'hidden') {
    const left = 1024 - p.right - p.width;
    const top = 768 - p.bottom - p.height;
    assert.equal(
      messagingDockRectsIntersect(
        { top, left, right: left + p.width, bottom: top + p.height, width: p.width, height: p.height },
        modal,
        8
      ),
      false
    );
  }
});

test('placement: full-viewport modal falls back to hidden', () => {
  const p = resolveMessagingDockPlacement({
    viewportWidth: 1280,
    viewportHeight: 800,
    modal: { top: 0, left: 0, right: 1280, bottom: 800, width: 1280, height: 800 }
  });
  assert.equal(p.mode, 'hidden');
});

test('dock uses adaptive placement and does not always return null on modal', () => {
  assert.match(dockSrc, /resolveMessagingDockPlacement/);
  assert.match(dockSrc, /useBlockingOverlaySnapshot/);
  assert.match(dockSrc, /data-dock-mode=/);
  assert.match(dockSrc, /icon-only/);
  assert.match(dockSrc, /restoreExpandedWindowsRef/);
  // Hide is last resort only when placement.mode === hidden && overlay.active
  assert.match(dockSrc, /placement\.mode === 'hidden' && overlay\.active/);
  // Must not unconditionally hide on any blocking overlay
  assert.equal(dockSrc.includes('if (blockingOverlay) return null'), false);
});

test('overlay observer cleans up and coalesces with rAF', () => {
  assert.match(overlaySrc, /MutationObserver/);
  assert.match(overlaySrc, /ResizeObserver/);
  assert.match(overlaySrc, /requestAnimationFrame/);
  assert.match(overlaySrc, /observer\.disconnect|mutationObserver\.disconnect/);
  assert.match(overlaySrc, /removeEventListener\('resize'/);
  assert.equal(overlaySrc.includes('setInterval'), false);
});

test('dock z-index stays below modal/composer layer contract', () => {
  assert.match(dockSrc, /z-\[35\]/);
  assert.match(composerClasses, /z-\[85\]/);
});

test('badge formatter remains 99+ capped for dock display', () => {
  assert.equal(formatMessagingBadgeCount(0), '');
  assert.equal(formatMessagingBadgeCount(1), '1');
  assert.equal(formatMessagingBadgeCount(99), '99');
  assert.equal(formatMessagingBadgeCount(999), '99+');
});

test('readBlockingOverlayActive detects aria-modal dialogs', () => {
  const dialog = {
    getAttribute: (name: string) =>
      name === 'aria-modal' ? 'true' : name === 'role' ? 'dialog' : name === 'aria-hidden' ? null : null,
    hasAttribute: (name: string) => name === 'aria-modal',
    closest: () => null
  };
  const root = {
    querySelectorAll: (sel: string) => (sel.includes('aria-modal') ? [dialog] : [])
  } as unknown as ParentNode;
  const prev = globalThis.window;
  (globalThis as any).window = {
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' })
  };
  try {
    assert.equal(readBlockingOverlayActive(root), true);
  } finally {
    if (prev === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = prev;
  }
});

test('readBlockingOverlayActive ignores empty roots', () => {
  const root = { querySelectorAll: () => [] } as unknown as ParentNode;
  assert.equal(readBlockingOverlayActive(root), false);
});

test('expanded dock and chat windows remain; chat chrome suppressed while blocking', () => {
  assert.match(dockSrc, /MessagingChatWindow/);
  assert.match(dockSrc, /showChatWindows = !overlay\.active/);
  assert.match(dockSrc, /minimizeConversationWindow/);
  assert.match(dockSrc, /restoreConversationWindow/);
  assert.match(dockSrc, /if \(!isAuthenticated \|\| !user \|\| !isDesktop\) return null/);
});

test('accessible labels cover normal and icon-only', () => {
  assert.match(
    dockSrc,
    /unreadCount > 0 \? `Messaging, \$\{unreadCount\} unread` : 'Messaging'/
  );
  assert.match(dockSrc, /title=\{/);
  assert.match(dockSrc, /aria-label="Collapse messaging"/);
});
