import prisma from '../utils/prismaClient';

export const FOLLOW_ONBOARDING_MIN_REQUIRED = 1;
export const FOLLOW_ONBOARDING_MAX_SELECTABLE = 6;
export const FOLLOW_ONBOARDING_REDIRECT_PATH = '/';

const toIso = (value?: Date | string | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const getFollowOnboardingStatus = async (
  userId: string,
  options?: {
    required?: boolean | null;
    completedAt?: Date | string | null;
  }
) => {
  const [userFollowCount, pageFollowCount] = await Promise.all([
    prisma.userFollow.count({ where: { followerId: userId } }),
    prisma.communityBusinessPageFollower.count({ where: { userId } })
  ]);

  const followedCount = Number(userFollowCount || 0) + Number(pageFollowCount || 0);
  const required = Boolean(options?.required);
  const completedAt = toIso(options?.completedAt);

  return {
    required,
    completedAt,
    minimumRequired: FOLLOW_ONBOARDING_MIN_REQUIRED,
    maximumSelectable: FOLLOW_ONBOARDING_MAX_SELECTABLE,
    followedCount,
    canContinue: followedCount >= FOLLOW_ONBOARDING_MIN_REQUIRED,
    redirectPath: FOLLOW_ONBOARDING_REDIRECT_PATH
  };
};

export const completeFollowOnboarding = async (userId: string) => {
  const status = await getFollowOnboardingStatus(userId, { required: true, completedAt: null });
  if (status.followedCount < FOLLOW_ONBOARDING_MIN_REQUIRED) {
    throw new Error(`Follow at least ${FOLLOW_ONBOARDING_MIN_REQUIRED} account or page to continue.`);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      followOnboardingRequired: false,
      followOnboardingCompletedAt: new Date()
    }
  });

  return {
    user,
    onboarding: await getFollowOnboardingStatus(userId, {
      required: false,
      completedAt: user.followOnboardingCompletedAt
    })
  };
};
