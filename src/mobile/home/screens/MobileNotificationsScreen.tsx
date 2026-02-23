import React, { useEffect, useMemo, useState } from 'react';
import { BellIcon as Bell, CheckIcon as Check } from '../../../components/icons/ShellIcons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotification } from '../../../context/NotificationContext';
import { getNotificationActionUrl, getNotificationBucket } from '../../../utils/notificationRouting';

export default function MobileNotificationsScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, refreshNotifications, markAsRead } = useNotification();
  const [tab, setTab] = useState<'home' | 'community'>('home');
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);

  useEffect(() => {
    void refreshNotifications?.().catch(() => {});
  }, [refreshNotifications]);

  const list = Array.isArray(notifications) ? notifications : [];
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

  return (
    <div className="mx-auto max-w-md px-3 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Bell className="h-4 w-4" />
          Notifications
        </div>
        <div className="flex items-center gap-2">
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

      {!visible.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No notifications yet.</div>
      ) : (
        <div className="space-y-3">
          {visible.map((n: any) => {
            const id = String(n?.id || '');
            const isRead = Boolean(n?.isRead ?? n?.is_read);
            const title = String(n?.title || 'Notification');
            const message = String(n?.message || '');
            const ts = String(n?.timestamp || n?.createdAt || '');
            const actionUrl = getNotificationActionUrl(n);
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (!isRead && id) markAsRead?.(id);
                  const metadata =
                    n?.metadata && typeof n.metadata === 'object' ? (n.metadata as Record<string, any>) : {};
                  const isCampaign =
                    String(n?.type || '').toLowerCase() === 'app_campaign' || Boolean(metadata?.campaignId);
                  if (isCampaign) {
                    setSelectedCampaign(n);
                    return;
                  }
                  if (actionUrl) navigate(actionUrl);
                }}
                className={[
                  'w-full rounded-3xl border bg-white p-4 text-left shadow-sm',
                  isRead ? 'border-slate-200' : 'border-blue-200'
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
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
            );
          })}
        </div>
      )}
      {selectedCampaignDetails ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3">
          <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl">
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
                    navigate(selectedCampaignDetails.actionUrl as string);
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
