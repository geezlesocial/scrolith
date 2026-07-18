import test from 'node:test';
import assert from 'node:assert/strict';
import {
  routeScrolithaIntent,
  matchSkillSuggestionSafe,
  sanitizeUserFacingReply,
  isConversationalIntent
} from '../scrolitha.intentRouter';

const admin = { id: 'a1', role: 'admin', scope: 'admin' as const, isAdmin: true };
const freelancer = { id: 'f1', role: 'freelancer', scope: 'user' as const, isAdmin: false };
const employer = { id: 'e1', role: 'employer', scope: 'user' as const, isAdmin: false };
const user = { id: 'u1', role: 'user', scope: 'user' as const, isAdmin: false };
const moderator = { id: 'm1', role: 'moderator', scope: 'admin' as const, isAdmin: true };

test('Hi is greeting for every role — never tools', () => {
  for (const actor of [admin, freelancer, employer, user, moderator]) {
    const r = routeScrolithaIntent({ message: 'Hi', actor });
    assert.equal(r.intent, 'CONVERSATION_GREETING', actor.role);
    assert.equal(r.allowTools, false);
    assert.equal(r.suggestions.length, 0);
    assert.match(r.userFacingReply, /Scrolitha/i);
    assert.doesNotMatch(
      r.userFacingReply,
      /Role:|Scope:|prepared one action|\bupload\b|\bmembership\b|Uploaded Files/i
    );
  }
});

test('Hello / good morning greetings', () => {
  for (const msg of ['Hello', 'Hey!', 'Good morning', 'good afternoon']) {
    const r = routeScrolithaIntent({ message: msg, actor: freelancer });
    assert.equal(r.intent, 'CONVERSATION_GREETING', msg);
    assert.equal(r.suggestions.length, 0);
  }
});

test('Find jobs for me is JOB_SEARCH even for admin — not employer growth', () => {
  for (const actor of [admin, freelancer, employer, user, moderator]) {
    const r = routeScrolithaIntent({ message: 'Find jobs for me', actor });
    assert.equal(r.intent, 'JOB_SEARCH', actor.role);
    assert.equal(r.suggestions.length, 0);
    assert.match(r.userFacingReply, /job/i);
    assert.doesNotMatch(
      r.userFacingReply,
      /membership|wallet funding|ad performance|referrals|retention|prepared one action/i
    );
  }
});

test('job search synonyms', () => {
  for (const msg of ['search jobs', 'looking for a job', 'show me jobs', 'recommend jobs']) {
    const r = routeScrolithaIntent({ message: msg, actor: admin });
    assert.equal(r.intent, 'JOB_SEARCH', msg);
  }
});

test('Find freelancers is FREELANCER_SEARCH', () => {
  const r = routeScrolithaIntent({ message: 'Find freelancers', actor: employer });
  assert.equal(r.intent, 'FREELANCER_SEARCH');
  assert.equal(r.suggestions.length, 0);
});

test('Improve my resume', () => {
  const r = routeScrolithaIntent({ message: 'Improve my resume', actor: freelancer });
  assert.equal(r.intent, 'RESUME_IMPROVEMENT');
});

test('growth phrases do not trigger on job search', () => {
  const r = routeScrolithaIntent({ message: 'Find jobs for me', actor: employer });
  assert.notEqual(r.intent, 'EMPLOYER_GROWTH');
  assert.notEqual(r.intent, 'GROWTH_PLAN');
});

test('explicit growth request allowed', () => {
  const r = routeScrolithaIntent({ message: 'Help my business grow', actor: employer });
  assert.equal(r.intent, 'EMPLOYER_GROWTH');
});

test('skill matcher rejects short tokens like hi/for/me', () => {
  const skills = [
    {
      key: 'employer_growth',
      name: 'Employer growth',
      description: 'Reviews membership, wallet funding, ad performance, referrals, and retention levers for employers.',
      stepsSchema: [{ tool: 'GET_MY_MEMBERSHIP_STATUS' }]
    },
    {
      key: 'file_help',
      name: 'File upload',
      description: 'Guides through uploading a file to Uploaded Files and attaching it to entities.',
      stepsSchema: [{ tool: 'UPLOAD_FILE_TO_LIBRARY' }]
    }
  ];
  assert.equal(matchSkillSuggestionSafe('Hi', skills), null);
  assert.equal(matchSkillSuggestionSafe('Find jobs for me', skills), null);
});

test('sanitize strips role/scope/policy leakage', () => {
  const dirty = [
    'Hello there.',
    'Role: admin',
    'Scope: admin',
    'Surface: messaging',
    'I will keep actions inside approved platform tools and only execute confirmed changes.'
  ].join('\n');
  const clean = sanitizeUserFacingReply(dirty);
  assert.match(clean, /Hello/);
  assert.doesNotMatch(clean, /Role:|Scope:|Surface:|approved platform tools/i);
});

test('isConversationalIntent', () => {
  assert.equal(isConversationalIntent('CONVERSATION_GREETING'), true);
  assert.equal(isConversationalIntent('JOB_SEARCH'), false);
});

test('thanks and help', () => {
  assert.equal(routeScrolithaIntent({ message: 'Thanks', actor: user }).intent, 'CONVERSATION_THANKS');
  assert.equal(routeScrolithaIntent({ message: 'What can you do?', actor: user }).intent, 'CONVERSATION_HELP');
});
