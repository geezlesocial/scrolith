/**
 * Wave 3 — backend consolidation contracts:
 * shared error classification, HTTP helpers, rewrite payload shape,
 * legacy status mapping, degradation copy, provider timeout helper reuse.
 */
import {
  classifyScrolithaError,
  mapLegacyScrolithaHttpStatus
} from '../scrolitha.errors';
import {
  asText,
  buildRewriteDataPayload,
  buildScrolithaMeta,
  parseLineList,
  sendScrolithaError,
  sendScrolithaPublicError
} from '../scrolitha.http';
import { userFacingDegradationMessage } from '../scrolitha.failureModes';
import { withTimeout } from '../scrolitha.performance';

const mockRes = () => {
  const res: any = {
    statusCode: 200,
    body: null as any
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: any) => {
    res.body = payload;
    return res;
  };
  return res;
};

describe('scrolitha Wave 3 consolidation', () => {
  test('classifies timeout, rollout, rate limit, and policy errors', () => {
    expect(classifyScrolithaError(new Error('Provider core timed out after 25000ms')).kind).toBe(
      'timeout'
    );
    expect(classifyScrolithaError(Object.assign(new Error('x'), { code: 'ETIMEDOUT' })).retryable).toBe(
      true
    );
    expect(
      classifyScrolithaError(new Error('Capability disabled by rollout')).kind
    ).toBe('rollout_disabled');
    expect(classifyScrolithaError(Object.assign(new Error('busy'), { status: 429 })).kind).toBe(
      'rate_limited'
    );
    expect(
      classifyScrolithaError(Object.assign(new Error('blocked'), { code: 'SCROLITHA_PROMPT_POLICY_BLOCKED' }))
        .kind
    ).toBe('policy_blocked');
  });

  test('legacy HTTP status mapping stays contract-compatible', () => {
    expect(mapLegacyScrolithaHttpStatus(new Error('message is required'), 'chat')).toBe(400);
    expect(mapLegacyScrolithaHttpStatus(new Error('rate limit exceeded'), 'chat')).toBe(429);
    expect(mapLegacyScrolithaHttpStatus(new Error('boom'), 'chat')).toBe(500);
    expect(mapLegacyScrolithaHttpStatus(new Error('action not allowed'), 'execute')).toBe(400);
    expect(mapLegacyScrolithaHttpStatus(new Error('rating required'), 'feedback')).toBe(400);
    expect(mapLegacyScrolithaHttpStatus(new Error('goal required'), 'workos')).toBe(400);
  });

  test('rewrite payload exposes multi-field aliases for FE compatibility', () => {
    const payload = buildRewriteDataPayload('Hello world', { mode: 'professional' });
    expect(payload).toEqual({
      rewrittenText: 'Hello world',
      enhancedText: 'Hello world',
      rewrite: 'Hello world',
      text: 'Hello world',
      mode: 'professional'
    });
  });

  test('buildScrolithaMeta normalizes fallback flags', () => {
    expect(buildScrolithaMeta({ usedFallback: true }).usedFallback).toBe(true);
    expect(buildScrolithaMeta({ fallbackUsed: true }).usedFallback).toBe(true);
    expect(buildScrolithaMeta({ usedBackupProcessing: true }).usedFallback).toBe(true);
    expect(buildScrolithaMeta({}).provider).toBe('scrolitha');
    expect(buildScrolithaMeta({}).model).toBe('Scrolitha');
  });

  test('asText and parseLineList helpers', () => {
    expect(asText('  hi  ')).toBe('hi');
    expect(asText(null, 'fallback')).toBe('fallback');
    expect(parseLineList('- one\n* two\n3. three')).toEqual(['one', 'two', 'three']);
    expect(parseLineList('', ['a'])).toEqual(['a']);
  });

  test('task error envelope includes data:null; public omits data', () => {
    const taskRes = mockRes();
    sendScrolithaError(taskRes, 'Failed to rewrite text', new Error('timeout waiting'), {
      logLabel: 'rewrite'
    });
    expect(taskRes.statusCode).toBe(500);
    expect(taskRes.body.success).toBe(false);
    expect(taskRes.body.data).toBeNull();
    expect(taskRes.body.message).toBe('Failed to rewrite text');
    expect(String(taskRes.body.error)).toMatch(/try again|too long|unavailable/i);

    const publicRes = mockRes();
    sendScrolithaPublicError(publicRes, 'Scrolitha chat failed', new Error('message is required'), {
      statusMode: 'chat'
    });
    expect(publicRes.statusCode).toBe(400);
    expect(publicRes.body.success).toBe(false);
    expect(publicRes.body).not.toHaveProperty('data');
    expect(publicRes.body.message).toBe('Scrolitha chat failed');
  });

  test('degradation messages use shared classifier', () => {
    expect(userFacingDegradationMessage('timeout')).toMatch(/try again/i);
    expect(userFacingDegradationMessage('disabled by rollout')).toMatch(/unavailable/i);
    expect(userFacingDegradationMessage('cancel')).toMatch(/cancel/i);
  });

  test('shared withTimeout rejects with labeled timeout', async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 20, 'Provider core')
    ).rejects.toThrow(/Provider core timed out after 20ms/i);
  });
});
