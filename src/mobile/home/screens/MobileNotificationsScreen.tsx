import React, { useEffect } from 'react';
import { Bell, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../../context/NotificationContext';

export default function MobileNotificationsScreen() {
  const navigate = useNavigate();
  const { notifications, refreshNotifications, markAsRead } = useNotification();

  useEffect(() => {
    void refreshNotifications?.().catch(() => {});
  }, [refreshNotifications]);

  const list = Array.isArray(notifications) ? notifications : [];

  return (
    <div className="mx-auto max-w-md px-3 py-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Bell className="h-4 w-4" />
        Notifications
      </div>

      {!list.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No notifications yet.</div>
      ) : (
        <div className="space-y-3">
          {list.map((n: any) => {
            const id = String(n?.id || '');
            const isRead = Boolean(n?.isRead ?? n?.is_read);
            const title = String(n?.title || 'Notification');
            const message = String(n?.message || '');
            const ts = String(n?.timestamp || n?.createdAt || '');
            const actionUrl = String(n?.actionUrl || n?.action_url || n?.url || '').trim();
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (!isRead && id) markAsRead?.(id);
                  if (actionUrl) {
                    navigate(actionUrl);
                  }
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
    </div>
  );
}

