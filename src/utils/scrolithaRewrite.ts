/**
 * Canonical client-side rewrite runner for Scrolitha assist surfaces.
 * Does not enable rollout capabilities; only wraps existing ScrolithaService.rewrite.
 */
import ScrolithaService, { type ScrolithaRewriteMode } from '../services/scrolitha';
import { classifyScrolithaClientError } from './scrolithaErrors';
import { extractScrolithaRewrittenText, extractScrolithaWarning } from './scrolithaText';

export type ScrolithaRewriteRequest = {
  text: string;
  mode?: ScrolithaRewriteMode;
  goal?: string;
  scope?: string;
  tone?: string;
};

export type ScrolithaRewriteSuccess = {
  ok: true;
  text: string;
  warning: string;
  raw: unknown;
};

export type ScrolithaRewriteFailure = {
  ok: false;
  message: string;
  retryable: boolean;
  kind: string;
};

export type ScrolithaRewriteResult = ScrolithaRewriteSuccess | ScrolithaRewriteFailure;

/**
 * Run a single rewrite request with consistent error classification.
 * Callers remain responsible for in-flight guards and UI state.
 */
export const runScrolithaRewrite = async (
  input: ScrolithaRewriteRequest
): Promise<ScrolithaRewriteResult> => {
  const text = String(input.text || '').trim();
  if (!text) {
    return {
      ok: false,
      message: 'Add some text first so Scrolitha can improve it.',
      retryable: false,
      kind: 'validation'
    };
  }

  try {
    const raw = await ScrolithaService.rewrite({
      text,
      mode: input.mode,
      goal: input.goal,
      scope: input.scope,
      tone: input.tone
    });
    const rewritten = extractScrolithaRewrittenText(raw);
    if (!rewritten) {
      return {
        ok: false,
        message: 'Scrolitha returned an empty result. Please try again.',
        retryable: true,
        kind: 'empty_result'
      };
    }
    return {
      ok: true,
      text: rewritten,
      warning: extractScrolithaWarning(raw),
      raw
    };
  } catch (error) {
    const classified = classifyScrolithaClientError(
      error,
      'Scrolitha could not improve this text right now.'
    );
    return {
      ok: false,
      message: classified.message,
      retryable: classified.retryable,
      kind: classified.kind
    };
  }
};
