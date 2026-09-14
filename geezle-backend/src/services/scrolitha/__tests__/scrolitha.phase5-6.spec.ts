import { assignPhase6Arm } from '../scrolitha.phase6';
import { getCalibrationSnapshot, recordCalibrationSignal } from '../scrolitha.phase5';

describe('Scrolitha Phase 5 and 6 safeguards', () => {
  it('records aggregate calibration signals without content fields', () => {
    recordCalibrationSignal({ signal: 'accepted', latencyMs: 120, relevance: 0.9 });
    const snapshot = getCalibrationSnapshot();
    expect(snapshot.signals.accepted).toBeGreaterThanOrEqual(1);
    expect(snapshot.privacy).toContain('no prompts');
    expect(snapshot).not.toHaveProperty('userId');
  });

  it('keeps Phase 6 assignment deterministic', () => {
    expect(assignPhase6Arm('internal-user-1')).toBe(assignPhase6Arm('internal-user-1'));
  });
});
