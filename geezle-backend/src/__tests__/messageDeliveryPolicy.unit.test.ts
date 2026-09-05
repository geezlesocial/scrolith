import {
  activeConversationParticipantIds,
  activeVoiceParticipantIds,
  validateCallSignal
} from '../services/messaging/messageDeliveryPolicy';

describe('message delivery policy', () => {
  test('only returns active conversation members and excludes the sender', () => {
    expect(activeConversationParticipantIds([
      { userId: 'sender', deletedAt: null },
      { userId: 'active', deletedAt: null },
      { userId: 'removed', deletedAt: new Date() },
      { userId: 'active', deletedAt: null }
    ], 'sender')).toEqual(['active']);
  });

  test('only returns currently invited or joined call participants', () => {
    expect(activeVoiceParticipantIds([
      { userId: 'joined', status: 'JOINED' },
      { userId: 'invited', status: 'INVITED' },
      { userId: 'left', status: 'LEFT' },
      { userId: 'rejected', status: 'REJECTED' }
    ])).toEqual(['joined', 'invited']);
  });

  test('normalizes supported signals and rejects unsafe payloads', () => {
    expect(validateCallSignal({ type: 'offer', sdp: 'v=0', injected: 'ignored' })).toEqual({
      type: 'offer',
      sdp: 'v=0'
    });
    expect(validateCallSignal({ type: 'data' })).toBeNull();
    expect(validateCallSignal({ type: 'candidate', candidate: 'x'.repeat(8 * 1024 + 1) })).toBeNull();
  });
});
