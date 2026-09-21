import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToPlainProse, toCanonicalUserFacingProse, userRequestedMarkdown } from '../scrolitha.responseFormat';
import { routeScrolithaIntent, sanitizeUserFacingReply } from '../scrolitha.intentRouter';

const freelancer = { id: 'f1', role: 'freelancer', scope: 'user' as const, isAdmin: false };

test('strips bold markers from ordinary prose', () => {
  const out = markdownToPlainProse("Hi! I'm **Scrolitha**, prefer **remote**, **hybrid**, or **onsite**.");
  assert.equal(out.includes('**'), false);
  assert.match(out, /Scrolitha/);
  assert.match(out, /remote/);
  assert.match(out, /hybrid/);
  assert.match(out, /onsite/);
});

test('greeting templates have no Markdown markers', () => {
  const r = routeScrolithaIntent({ message: 'Hi', actor: freelancer });
  assert.equal(r.userFacingReply.includes('**'), false);
  assert.match(r.userFacingReply, /Scrolitha/);
});

test('job search templates have no Markdown markers', () => {
  const r = routeScrolithaIntent({ message: 'Find jobs for me', actor: freelancer });
  assert.equal(r.userFacingReply.includes('**'), false);
  assert.match(r.userFacingReply, /remote/i);
  assert.match(r.userFacingReply, /hybrid/i);
});

test('sanitize applies plain-text contract', () => {
  const clean = sanitizeUserFacingReply('Hello **world** and **remote** work.');
  assert.equal(clean.includes('**'), false);
  assert.match(clean, /Hello world/);
});

test('does not destroy multiplication-like text carelessly', () => {
  // Bare asterisk between spaces should remain if not paired emphasis
  const out = markdownToPlainProse('Use 2 * 3 for the area formula.');
  assert.match(out, /2 \* 3/);
});

test('userRequestedMarkdown detection', () => {
  assert.equal(userRequestedMarkdown('reply in markdown'), true);
  assert.equal(userRequestedMarkdown('Find jobs for me'), false);
});

test('toCanonicalUserFacingProse collapses blank lines', () => {
  const out = toCanonicalUserFacingProse('Line one.\n\n\n\nLine two.');
  assert.equal(out.includes('\n\n\n'), false);
});

test('links become plain labels', () => {
  const out = markdownToPlainProse('See [Jobs](https://scrolith.com/jobs) here.');
  assert.equal(out.includes(']('), false);
  assert.match(out, /Jobs/);
});

test('ordinary responses remove HTML tags and event-handler attributes', () => {
  const out = markdownToPlainProse('<img src="javascript:alert(1)" onerror="alert(2)">Hello <b>world</b>');
  assert.equal(out.includes('<img'), false);
  assert.equal(out.includes('onerror'), false);
  assert.equal(out.includes('javascript:'), false);
  assert.match(out, /Hello world/);
});
