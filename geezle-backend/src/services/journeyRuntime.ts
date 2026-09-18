export type JourneyRuntimeControllerOptions = {
  enabled: () => boolean;
  poll: () => Promise<unknown> | unknown;
  onError: (error: unknown) => void;
  intervalMs: number;
};

export const createJourneyRuntimeController = ({
  enabled,
  poll,
  onError,
  intervalMs
}: JourneyRuntimeControllerOptions) => {
  let timer: NodeJS.Timeout | null = null;

  const runPoll = () => {
    void Promise.resolve(poll()).catch(onError);
  };

  return {
    ensure() {
      if (!enabled() || timer) return false;

      timer = setInterval(runPoll, intervalMs);
      timer.unref?.();
      runPoll();
      return true;
    },
    shutdown() {
      if (!timer) return false;

      clearInterval(timer);
      timer = null;
      return true;
    },
    isRunning() {
      return Boolean(timer);
    }
  };
};
