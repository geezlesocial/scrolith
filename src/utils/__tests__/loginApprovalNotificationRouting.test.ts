import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test, vi } from 'vitest';
import {
  getLoginApprovalAttemptId,
  getNotificationActionUrl,
  getNotificationBucket,
  isLoginApprovalNotification,
  LOGIN_APPROVAL_OPEN_EVENT,
  openLoginApprovalNotification
} from '../notificationRouting';
import { buildEnterprisePushDeepLink } from '../notificationTaxonomy';

const loginApprovalNotification = (overrides: Record<string, unknown> = {}) => ({
  id: 'notif-1',
  type: 'security.login_approval.requested',
  entityType: 'login_approval',
  entityId: 'attempt-1',
  actionUrl: '/community',
  metadata: {
    attemptId: 'attempt-1',
    category: 'security'
  },
  ...overrides
});

describe('login approval notification routing', () => {
  test('login approval notification with actionUrl="/community" is bucketed as Home', () => {
    expect(getNotificationBucket(loginApprovalNotification())).toBe('home');
  });

  test('legacy login approval with a generic Community URL is still Home', () => {
    expect(
      getNotificationBucket(
        loginApprovalNotification({
          type: 'security:login_approval_required',
          action_url: '/community?tab=groups',
          metadata: { attempt_id: 'attempt-legacy', category: 'security' }
        })
      )
    ).toBe('home');
  });

  test('ordinary Community notification remains Community', () => {
    expect(
      getNotificationBucket({
        id: 'community-1',
        type: 'community_group_invite_received',
        actionUrl: '/community/clubs?group=club-1',
        metadata: { groupId: 'club-1' }
      })
    ).toBe('community');
  });

  test('ordinary Home notification remains Home', () => {
    expect(
      getNotificationBucket({
        id: 'home-1',
        type: 'personal.follow',
        actionUrl: '/profile/alex',
        metadata: { actorUsername: 'alex' }
      })
    ).toBe('home');
  });

  test('attemptId extraction supports backend notification shapes', () => {
    expect(getLoginApprovalAttemptId(loginApprovalNotification())).toBe('attempt-1');
    expect(
      getLoginApprovalAttemptId({
        notificationType: 'login_approval',
        entity_id: 'attempt-entity'
      })
    ).toBe('attempt-entity');
    expect(
      getLoginApprovalAttemptId({
        type: 'security.login_approval.requested',
        metadata: { attempt_id: 'attempt-meta' }
      })
    ).toBe('attempt-meta');
  });

  test('login approval action URL is suppressed so clicks do not navigate to Community', () => {
    const notification = loginApprovalNotification({ actionUrl: '/community' });
    expect(isLoginApprovalNotification(notification)).toBe(true);
    expect(getNotificationActionUrl(notification)).toBeUndefined();
  });

  test('login approval click dispatches an in-place overlay command for the exact attempt', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    expect(openLoginApprovalNotification(loginApprovalNotification())).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe(LOGIN_APPROVAL_OPEN_EVENT);
    expect(event.detail).toMatchObject({
      attemptId: 'attempt-1',
      eventId: 'login-approval:attempt-1',
      notificationId: 'notif-1'
    });
    vi.unstubAllGlobals();
  });

  test('login approval push taxonomy does not synthesize a route destination', () => {
    expect(
      buildEnterprisePushDeepLink({
        type: 'security.login_approval.requested',
        attemptId: 'attempt-1',
        entityId: 'attempt-1'
      })
    ).toBeNull();
  });
});

describe('login approval overlay integration contract', () => {
  const overlaySource = readFileSync(
    join(__dirname, '..', '..', 'components', 'security', 'LoginApprovalOverlay.tsx'),
    'utf8'
  );

  test('duplicate notification and realtime events converge on one active overlay path', () => {
    expect(overlaySource).toContain('LOGIN_APPROVAL_OPEN_EVENT');
    expect(overlaySource).toContain('remember(request)');
    expect(overlaySource).toContain('current?.attemptId === request.attemptId');
  });

  test('resolution events close or update the matching overlay', () => {
    expect(overlaySource).toContain('security.login_approval.updated');
    expect(overlaySource).toContain('security.login_approval.resolved');
    expect(overlaySource).toContain("request.status !== 'PENDING'");
  });

  test('notification click review resolves pending approvals instead of trusting notification data', () => {
    expect(overlaySource).toContain('DeviceSecurityService.listPendingApprovals');
    expect(overlaySource).toContain('openPendingByAttemptId');
  });
});
