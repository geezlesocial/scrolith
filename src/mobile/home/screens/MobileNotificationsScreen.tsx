import React, { useEffect, useMemo, useState } from 'react';
import { BellIcon as Bell, CheckIcon as Check } from '../../../components/icons/ShellIcons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotification } from '../../../context/NotificationContext';
import { useUser } from '../../../context/UserContext';
import {
  getNotificationActionUrl,
  getNotificationBucket,
  getNotificationCategoryLabel,
  isExternalNotificationUrl,
  isLoginApprovalNotification,
  openLoginApprovalNotification
} from '../../../utils/notificationRouting';
import {
  groupNotificationsForDisplay,
  muteConversationNotifications
} from '../../../utils/notificationExcellence';
import { MOBILE_MODAL_CARD_CLASS, MOBILE_PAGE_SECTION_CLASS } from '../mobileShellLayout';

export default function MobileNotificationsScreen({
  onNavigate
}: {
  onNavigate?: (to: string) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useUser();
  const { notifications, refreshNotifications, markAsRead } = useNotification();
  const [tab, setTab] = useState<'home' | 'community'>('home');
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const normalizedRole = String(user?.role || '').toLowerCase();
  const isClientMode = normalizedRole.includes('client') || normalizedRole.includes('employer');
  const dashboardBasePath = normalizedRole.includes('admin')
    ? '/admin/dashboard'
    : isClientMode
      ? '/client/dashboard'
      : '/freelancer/dashboard';

  useEffect(() => {
    void refreshNotifications?.().catch(() => {});
  }, [refreshNotifications]);

  const list = Array.isArray(notifications) ? notifications : [];
  const openFullCenter = () => {
    if (onNavigate) onNavigate('/notifications');
    else navigate('/notifications');
  };
  const buckets = useMemo(() => {
    const home: any[] = [];
    const community: any[] = [];
    list.forEach((n) => {
      (getNotificationBucket(n) === 'community' ? community : home).push(n);
    });
    return { home, community };
  }, [list]);

  const unreadCounts = useMemo(() => {
    const countUnread = (rows: any[]) => rows.filter((n) => !Boolean(n?.isRead ?? n?.is_read)).length;
    return {
      home: countUnread(buckets.home),
      community: countUnread(buckets.community)
    };
  }, [buckets]);

  const visible = tab === 'community' ? buckets.community : buckets.home;
  const groupedVisible = useMemo(() => groupNotificationsForDisplay(visible), [visible]);
  const growthShortcuts = useMemo(() => {
    if (!isAuthenticated || !normalizedRole || normalizedRole === 'guest') return [];
    if (dashboardBasePath === '/admin/dashboard') {
      return [
        {
          id: 'admin-finance',
          label: 'Finance',
          caption: 'Revenue',
          path: '/admin/dashboard?tab=finance'
        }
      ];
    }

    const common = [
      {
        id: 'wallet',
        label: 'Wallet',
        caption: isClientMode ? 'Funding' : 'Payouts',
        path: `${dashboardBasePath}?tab=wallet`
      },
      {
        id: 'membership',
        label: 'Membership',
        caption: isClientMode ? 'Retention' : 'Upgrade',
        path: `${dashboardBasePath}?tab=membership`
      },
      {
        id: 'affiliate',
        label: 'Affiliate',
        caption: 'Referrals',
        path: `${dashboardBasePath}?tab=affiliate-program`
      }
    ];

    return isClientMode
      ? common.concat({
          id: 'ads',
          label: 'My Ads',
          caption: 'Campaigns',
          path: `${dashboardBasePath}?tab=my-ads`
        })
      : common.concat({
          id: 'gcoin',
          label: 'Gcoin',
          caption: 'Rewards',
          path: `${dashboardBasePath}?tab=gcoin`
        });
  }, [dashboardBasePath, isAuthenticated, isClientMode, normalizedRole]);

  const selectedCampaignDetails = useMemo(() => {
    if (!selectedCampaign) return null;
    const metadata =
      selectedCampaign?.metadata && typeof selectedCampaign.metadata === 'object'
        ? selectedCampaign.metadata
        : {};
    return {
      title: String(metadata?.campaignName || selectedCampaign?.title || 'Campaign'),
      message: String(selectedCampaign?.message || selectedCampaign?.body || ''),
      mediaType: String(metadata?.mediaType || '').toLowerCase(),
      mediaUrl: String(metadata?.mediaUrl || ''),
      actionUrl: getNotificationActionUrl(selectedCampaign),
      createdAt: String(selectedCampaign?.timestamp || selectedCampaign?.createdAt || '')
    };
  }, [selectedCampaign]);

  useEffect(() => {
    const campaignId = new URLSearchParams(location.search).get('campaignId');
    if (!campaignId) return;
    const match = list.find((entry: any) => {
      const metadata =
        entry?.metadata && typeof entry.metadata === 'object' ? (entry.metadata as Record<string, any>) : {};
      return (
        String(metadata?.campaignId || metadata?.campaign_id || '') === campaignId ||
        String(entry?.id || '') === campaignId
      );
    });
    if (match) {
      setSelectedCampaign(match);
    }
  }, [location.search, list]);

  const openTarget = (targetUrl: string) => {
    if (!targetUrl) return;
    if (isExternalNotificationUrl(targetUrl)) {
      const externalWindow = window.open(targetUrl, '_blank', 'noopener,noreferrer');
      if (!externalWindow) {
        window.location.assign(targetUrl);
      }
      return;
    }
    if (onNavigate) {
      onNavigate(targetUrl);
      return;
    }
    navigate(targetUrl);
  };

  return (
    <div className={MOBILE_PAGE_SECTION_CLASS}>
      {growthShortcuts.length ? (
        <div className="mb-3 rounded-3xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/70 to-slate-50 p-4 shadow-sm">
          <div className="mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
              Growth shortcuts
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {isClientMode ? 'Retention, wallet, and campaign controls' : 'Monetization, rewards, and payout controls'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {growthShortcuts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openTarget(item.path)}
                className="rounded-2xl border border-white/80 bg-white px-3 py-3 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/60"
              >
                <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                <div className="mt-1 text-[11px] text-slate-500">{item.caption}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Bell className="h-4 w-4" />
          Notifications
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openFullCenter}
            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
          >
            Full inbox
          </button>
          <button
            type="button"
            onClick={() => setTab('home')}
            className={[
              'rounded-full px-3 py-1 text-xs font-semibold',
              tab === 'home' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
            ].join(' ')}
          >
            Home{unreadCounts.home ? ` (${unreadCounts.home})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setTab('community')}
            className={[
              'rounded-full px-3 py-1 text-xs font-semibold',
              tab === 'community' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
            ].join(' ')}
          >
            Community{unreadCounts.community ? ` (${unreadCounts.community})` : ''}
          </button>
        </div>
      </div>

      {!groupedVisible.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No notifications yet.</div>
      ) : (
        <div className="space-y-3">
          {groupedVisible.map((group) => {
            const n = group.latest;
            const id = String(n?.id || group.groupKey);
            const isRead = Boolean(n?.isRead ?? n?.is_read);
            const title = String(n?.title || 'Notification');
            const message = String(n?.message || '');
            const ts = String(n?.timestamp || n?.createdAt || '');
            const actionUrl = getNotificationActionUrl(n);
            const categoryLabel =
              String(n?.categoryLabel || n?.metadata?.categoryLabel || '').trim() ||
              getNotificationCategoryLabel({
                type: n?.type,
                category: n?.category || n?.metadata?.category,
                entityType: n?.entityType || n?.metadata?.entityType,
                title,
                metadata: n?.metadata
              });
            const conversationId = String(
              n?.conversationId || n?.metadata?.conversationId || n?.metadata?.conversation_id || ''
            ).trim();
            return (
              <div
                key={group.groupKey}
                className={[
                  'w-full rounded-3xl border bg-white p-4 text-left shadow-sm',
                  isRead ? 'border-slate-200' : 'border-blue-200'
                ].join(' ')}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    if (!isRead && id) markAsRead?.(id);
                    // Mark stack as read for collapsed groups.
                    if (group.count > 1) {
                      group.items.forEach((item: any) => {
                        const itemId = String(item?.id || '');
                        if (itemId && !Boolean(item?.isRead ?? item?.is_read)) markAsRead?.(itemId);
                      });
                    }
                    const metadata =
                      n?.metadata && typeof n.metadata === 'object' ? (n.metadata as Record<string, any>) : {};
                    const isCampaign =
                      String(n?.type || '').toLowerCase() === 'app_campaign' || Boolean(metadata?.campaignId);
                    if (isCampaign) {
                      setSelectedCampaign(n);
                      return;
                    }
                    if (isLoginApprovalNotification(n)) {
                      openLoginApprovalNotification(n);
                      return;
                    }
                    if (actionUrl) {
                      openTarget(actionUrl);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                          {categoryLabel}
                        </span>
                        {group.count > 1 ? (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {group.count} stacked
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
                      {message ? <div className="mt-1 text-sm text-slate-600 line-clamp-2">{message}</div> : null}
                      {ts ? <div className="mt-2 text-xs text-slate-400">{new Date(ts).toLocaleString()}</div> : null}
                    </div>
                    {isRead ? (
                      <div className="rounded-full border border-slate-200 bg-white p-2 text-slate-500" title="Read">
                        <Check className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="h-2.5 w-2.5 rounded-full bg-blue-600" aria-label="Unread" />
                    )}
                  </div>
                </button>
                {conversationId ? (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        muteConversationNotifications(conversationId, 24 * 60 * 60 * 1000);
                      }}
                    >
                      Mute 24h
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {selectedCampaignDetails ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3">
          <div className={MOBILE_MODAL_CARD_CLASS}>
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">{selectedCampaignDetails.title}</div>
              <button
                type="button"
                onClick={() => setSelectedCampaign(null)}
                className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600"
              >
                Close
              </button>
            </div>
            {selectedCampaignDetails.message ? (
              <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700">{selectedCampaignDetails.message}</p>
            ) : null}
            {selectedCampaignDetails.mediaUrl && selectedCampaignDetails.mediaType === 'image' ? (
              <img
                src={selectedCampaignDetails.mediaUrl}
                alt={selectedCampaignDetails.title}
                className="mb-3 h-44 w-full rounded-2xl border border-slate-200 object-cover"
              />
            ) : null}
            {selectedCampaignDetails.mediaUrl && selectedCampaignDetails.mediaType === 'video' ? (
              <video
                src={selectedCampaignDetails.mediaUrl}
                controls
                className="mb-3 h-44 w-full rounded-2xl border border-slate-200 object-cover"
              />
            ) : null}
            {selectedCampaignDetails.createdAt ? (
              <p className="mb-3 text-xs text-slate-400">
                {new Date(selectedCampaignDetails.createdAt).toLocaleString()}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              {selectedCampaignDetails.actionUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    openTarget(selectedCampaignDetails.actionUrl as string);
                    setSelectedCampaign(null);
                  }}
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                >
                  Open
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
