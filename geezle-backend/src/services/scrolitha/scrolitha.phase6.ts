/** Phase 6: privacy-aware personalized ranking and adaptive learning controls. */
import { hashCacheKey } from './scrolitha.enterpriseCache';
import { buildPersonalizationContext, personalizeRecommendations, type PersonalizationContext } from './scrolitha.personalization';
import type { RecommendationItem } from './scrolitha.recommendationEngine';
import { getCalibrationSnapshot } from './scrolitha.phase5';

export const SCROLITHA_PHASE6_VERSION = 'phase6-personalized-ranking-v1';

export const assignPhase6Arm = (subjectId: string, experiment = SCROLITHA_PHASE6_VERSION) => {
  const bucket = parseInt(hashCacheKey(['phase6-arm', experiment, subjectId]).slice(0, 8), 16) % 100;
  return bucket < 50 ? 'baseline' : 'personalized';
};

export const personalizeWithCalibration = (
  items: RecommendationItem[],
  context: PersonalizationContext,
  subjectId?: string
) => {
  const calibration = getCalibrationSnapshot();
  const arm = subjectId ? assignPhase6Arm(subjectId) : 'personalized';
  if (arm === 'baseline' || !calibration.calibrationActive) {
    return {
      items: items.slice().sort((a, b) => b.score - a.score),
      personalizationApplied: false,
      arm,
      calibrationActive: calibration.calibrationActive,
      reason: calibration.calibrationActive ? 'Controlled baseline cohort' : 'Calibration quality gate not met'
    };
  }
  const result = personalizeRecommendations(items, context);
  return { ...result, arm, calibrationActive: true };
};

export const buildPhase6Context = (input: { userId: string; sessionKey?: string | null }) =>
  buildPersonalizationContext(input);

