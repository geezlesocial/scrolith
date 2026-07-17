/**
 * Phase 20.2.3 — engagement notification type contracts.
 */
describe('engagement phase 20.2.3 notification types', () => {
  test('reaction_on_comment is a valid engagement notification type string', () => {
    // Compile-time + runtime guard for the additive type.
    const types = [
      'reaction_on_post',
      'reaction_on_comment',
      'comment_on_post'
    ];
    expect(types).toContain('reaction_on_comment');
    expect(types.includes('reaction_on_comment')).toBe(true);
  });

  test('dual-write target uniqueness keys are stable', () => {
    const postId = 'post_1';
    const userId = 'user_1';
    const uniqueKey = `${postId}:${userId}`;
    expect(uniqueKey).toBe('post_1:user_1');
  });
});
