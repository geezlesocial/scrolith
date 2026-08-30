import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPostMessageId } from '../../src/utils/postShare';
import { buildContractDashboardPath, getContractPaymentSummary } from '../../src/utils/workflowNavigation';

test('Phase 2 workflow polish: creates a stable per-post, per-conversation message identity', () => {
    const input = {
      postId: 'post-42',
      conversationId: 'conversation-9',
      permalinkUrl: 'https://scrolith.com/post/42',
      shareAttemptId: 'attempt-1'
    };
    assert.equal(buildPostMessageId(input), 'post-share:post-42:conversation-9:attempt-1');
    assert.equal(buildPostMessageId(input), buildPostMessageId(input));
    assert.notEqual(buildPostMessageId(input), buildPostMessageId({ ...input, shareAttemptId: 'attempt-2' }));
});

test('Phase 2 workflow polish: deep-links accepted employer proposals to the selected contract', () => {
    assert.equal(buildContractDashboardPath('contract/42'),
      '/client/dashboard?tab=contracts&contract=contract%2F42&contract_id=contract%2F42'
    );
});

test('Phase 2 workflow polish: separates fixed milestone payment states from hourly due amounts', () => {
    const fixedSummary = getContractPaymentSummary({
      type: 'fixed',
      milestones: [
        { id: '1', title: 'Draft', amount: 100, dueDate: '', order: 0, status: 'submitted' },
        { id: '2', title: 'Final', amount: 200, dueDate: '', order: 1, status: 'approved' },
        { id: '3', title: 'Paid', amount: 50, dueDate: '', order: 2, status: 'paid' }
      ]
    });
    assert.equal(fixedSummary.model, 'fixed');
    assert.equal(fixedSummary.submittedAmount, 100);
    assert.equal(fixedSummary.approvedAmount, 200);
    assert.equal(fixedSummary.paidAmount, 50);
    assert.equal(getContractPaymentSummary({ type: 'hourly', earningsPending: 75, milestones: [] }).approvedAmount, 75);
});
