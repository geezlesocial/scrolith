/**
 * Phase 5.1 — single-flight publish guard to prevent double-submit.
 */

export type PublishGuard = {
  /** Returns false if a publish is already in flight. */
  tryBegin: () => boolean;
  end: () => void;
  isBusy: () => boolean;
};

export const createPublishGuard = (): PublishGuard => {
  let busy = false;
  return {
    tryBegin: () => {
      if (busy) return false;
      busy = true;
      return true;
    },
    end: () => {
      busy = false;
    },
    isBusy: () => busy
  };
};
