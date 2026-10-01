export type HumanVerificationAutoLoadInputs = {
  autoLoad: boolean;
  disabled: boolean;
  endpoint: string;
};

export const getHumanVerificationAutoLoadKey = ({
  autoLoad,
  disabled,
  endpoint
}: HumanVerificationAutoLoadInputs): string | null => {
  return autoLoad && !disabled ? endpoint : null;
};

export const shouldAutoLoadHumanVerification = (
  previousKey: string | null,
  nextKey: string | null
): boolean => nextKey !== null && nextKey !== previousKey;

export const runHumanVerificationAutoLoad = (
  state: { current: string | null },
  inputs: HumanVerificationAutoLoadInputs,
  loadChallenge: () => void
): boolean => {
  const nextKey = getHumanVerificationAutoLoadKey(inputs);
  const shouldLoad = shouldAutoLoadHumanVerification(state.current, nextKey);
  state.current = nextKey;
  if (!shouldLoad) return false;
  loadChallenge();
  return true;
};

export const deliverHumanVerificationToken = (
  result: { success: boolean; verificationToken?: string },
  onVerified: (token: string | null) => void
): boolean => {
  if (!result.success || !result.verificationToken) return false;
  onVerified(result.verificationToken);
  return true;
};
