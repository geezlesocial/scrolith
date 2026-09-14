import {
  assignPhase4Arm,
  getPhase4TaskCatalog,
  runPhase4Evaluation,
  SCROLITHA_PHASE4_VERSION
} from '../scrolitha.phase4';

describe('Scrolitha Phase 4 evaluation suite', () => {
  test('uses an anonymized Scrolith task catalog', () => {
    const catalog = getPhase4TaskCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(5);
    expect(catalog.every((task) => task.id.startsWith('anon-'))).toBe(true);
    expect(catalog.every((task) => !('query' in task))).toBe(true);
  });

  test('assigns a subject deterministically to a controlled arm', () => {
    const first = assignPhase4Arm('internal-test-subject-1');
    expect(assignPhase4Arm('internal-test-subject-1')).toBe(first);
    expect(['baseline', 'hybrid-tiered']).toContain(first);
  });

  test('evaluates ranking and tiering without provider calls', () => {
    const result = runPhase4Evaluation({ forceRefresh: true });
    expect(result.version).toBe(SCROLITHA_PHASE4_VERSION);
    expect(result.experiment.liveTrafficMutation).toBe(false);
    expect(result.experiment.externalProviderCalls).toBe(false);
    expect(result.taskCount).toBeGreaterThanOrEqual(5);
    expect(result.arms).toHaveLength(2);
    expect(result.arms.every((arm) => arm.safetyPassRate === 1)).toBe(true);
  });
});
