import { feedbackMetrics } from './feedbackMetrics';

export const feedbackAggregator = {
  getAdminSummary() {
    return feedbackMetrics.snapshot();
  }
};
