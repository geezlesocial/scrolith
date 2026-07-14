/**
 * Hotfix — composer input focus: pure helpers + contracts that prevent focus loss while typing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  applyMentionOrTagSuggestion,
  findActiveToken
} from '../../src/community/components/mentionHashtagTokens.ts';

const here = dirname(fileURLToPath(import.meta.url));
const shellSource = readFileSync(join(here, '../../src/components/composer/ComposerShell.tsx'), 'utf8');
const mentionSource = readFileSync(
  join(here, '../../src/community/components/MentionHashtagTextarea.tsx'),
  'utf8'
);
const memberHomeSource = readFileSync(
  join(here, '../../src/components/sections/MemberHomeSection.tsx'),
  'utf8'
);

test('findActiveToken opens mention popup without requiring editor remount', () => {
  const token = findActiveToken('Hello @al', 9, { mentionsEnabled: true, hashtagsEnabled: true });
  assert.ok(token);
  assert.equal(token?.kind, 'mention');
  assert.equal(token?.query, 'al');
});

test('findActiveToken opens hashtag popup for mid-sentence typing', () => {
  const value = 'Talking about #ai';
  const token = findActiveToken(value, value.length, { mentionsEnabled: true, hashtagsEnabled: true });
  assert.ok(token);
  assert.equal(token?.kind, 'tag');
  assert.equal(token?.query, 'ai');
});

test('findActiveToken returns null for plain sentences (no popup)', () => {
  const value = 'Just a normal sentence with spaces.';
  const token = findActiveToken(value, value.length, { mentionsEnabled: true, hashtagsEnabled: true });
  assert.equal(token, null);
});

test('applyMentionOrTagSuggestion inserts mention and places caret after token', () => {
  const value = 'Hello @al';
  const token = findActiveToken(value, value.length, { mentionsEnabled: true, hashtagsEnabled: true });
  assert.ok(token);
  const result = applyMentionOrTagSuggestion({
    value,
    replaceStart: token!.replaceStart,
    replaceEnd: token!.replaceEnd,
    kind: 'mention',
    tokenBody: 'alice'
  });
  assert.equal(result.nextValue, 'Hello @alice ');
  assert.equal(result.caret, result.nextValue.length);
  // Editor DOM node identity is not part of pure helper; caret is after inserted value.
  assert.ok(result.caret > token!.replaceStart);
});

test('applyMentionOrTagSuggestion inserts tag with trailing space for continued typing', () => {
  const value = 'Topic #scro';
  const token = findActiveToken(value, value.length, { mentionsEnabled: true, hashtagsEnabled: true });
  assert.ok(token);
  const result = applyMentionOrTagSuggestion({
    value,
    replaceStart: token!.replaceStart,
    replaceEnd: token!.replaceEnd,
    kind: 'tag',
    tokenBody: 'scrolith'
  });
  assert.equal(result.nextValue, 'Topic #scrolith ');
  assert.equal(result.caret, 'Topic #scrolith '.length);
});

test('ComposerShell focus trap effect depends only on open (not onClose)', () => {
  // Unstable onClose was recreating the trap after every keystroke and stealing focus.
  assert.match(shellSource, /onCloseRef\.current\s*=\s*onClose/);
  assert.match(shellSource, /},\s*\[open\]\s*\);/);
  assert.equal(shellSource.includes('}, [open, onClose]);'), false);
});

test('ComposerShell does not force initial focus when panel already has focus', () => {
  assert.match(shellSource, /panel\?\.contains\(document\.activeElement\)/);
});

test('ComposerShell Escape respects defaultPrevented from nested popup handlers', () => {
  assert.match(shellSource, /if \(event\.defaultPrevented\) return;/);
});

test('ComposerShell excludes tabindex=-1 suggestion rows from trap list', () => {
  assert.match(shellSource, /button:not\(\[disabled\]\):not\(\[tabindex="-1"\]\)/);
});

test('MentionHashtagTextarea Escape stops propagation so composer stays open', () => {
  assert.match(mentionSource, /event\.stopPropagation\(\)/);
  assert.match(mentionSource, /event\.key === 'Escape'/);
});

test('MentionHashtagTextarea suggestion rows prevent mousedown blur', () => {
  assert.match(mentionSource, /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/);
  assert.match(mentionSource, /onPointerDown=\{\(e\) => e\.preventDefault\(\)\}/);
  assert.match(mentionSource, /tabIndex=\{-1\}/);
});

test('MentionHashtagTextarea keeps DOM focus on editor via aria-activedescendant', () => {
  assert.match(mentionSource, /aria-activedescendant/);
  assert.match(mentionSource, /role="combobox"/);
  assert.match(mentionSource, /role="listbox"/);
});

test('MemberHomeSection closeDesktopComposer is stable (empty deps / refs)', () => {
  assert.match(memberHomeSource, /const closeDesktopComposer = useCallback\(\(\) => \{/);
  assert.match(memberHomeSource, /postDraftRef\.current/);
  assert.match(memberHomeSource, /composerDraftKeyRef\.current/);
  // Empty dependency array — identity does not change on draft keystrokes.
  assert.match(memberHomeSource, /setPostLocationPickerOpen\(false\);\s*\}, \[\]\);/s);
});

test('MemberHomeSection editor has no dynamic key tied to draft content', () => {
  // The composer editor must not remount on text updates.
  const editorBlock = memberHomeSource.match(
    /<MentionHashtagTextarea[\s\S]{0,400}className=\{composerEditor\}/
  );
  assert.ok(editorBlock, 'composer MentionHashtagTextarea present');
  assert.equal(/key=\{/.test(editorBlock![0]), false);
});

test('Draft autosave is debounced and does not remount editor (session text only)', () => {
  assert.match(memberHomeSource, /saveComposerDraft\(composerDraftKey/);
  assert.match(memberHomeSource, /450/);
  assert.equal(memberHomeSource.includes('key={postDraft.content}'), false);
  assert.equal(memberHomeSource.includes('key={composerDraftKey}'), false);
});
