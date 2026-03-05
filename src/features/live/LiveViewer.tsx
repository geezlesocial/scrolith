import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart, Radio, ThumbsUp } from 'lucide-react';
import { LiveService, type LiveSession } from '../../services/live';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import ParticipantGrid from './components/ParticipantGrid';
import GiftPanel from './components/GiftPanel';
import ReactionOverlay from './components/ReactionOverlay';

type FloatingReaction = {
  id: string;
  emoji: string;
};

const LiveViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const sessionId = String(id || '').trim();
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const { socket, isConnected } = useSocket();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [giftSending, setGiftSending] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const data = await LiveService.getSession(sessionId);
      setSession(data);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to load livestream.';
      showNotification('error', 'Livestream', message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, showNotification]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!socket || !isConnected || !sessionId) return;
    socket.emit('live:join', { sessionId });
    return () => {
      socket.emit('live:leave', { sessionId });
    };
  }, [socket, isConnected, sessionId]);

  useEffect(() => {
    const pruneTimer = setInterval(() => {
      setFloatingReactions((prev) => prev.slice(-12));
    }, 1200);
    return () => clearInterval(pruneTimer);
  }, []);

  useEffect(() => {
    const onReaction = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '') !== sessionId) return;
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          likesCount: Number(detail.likesCount ?? prev.likesCount ?? 0),
          lovesCount: Number(detail.lovesCount ?? prev.lovesCount ?? 0)
        };
      });
      const emoji = String(detail.type || '').toLowerCase() === 'love' ? '❤️' : '👍';
      setFloatingReactions((prev) => [...prev.slice(-10), { id: `${Date.now()}-${Math.random()}`, emoji }]);
    };

    const onViewer = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '') !== sessionId) return;
      setSession((prev) => {
        if (!prev) return prev;
        const viewerCount = Number(detail.viewerCount ?? prev.viewerCount ?? 0);
        const peak = Math.max(Number(prev.peakViewerCount || 0), viewerCount);
        return {
          ...prev,
          viewerCount,
          peakViewerCount: peak
        };
      });
    };

    const onEnded = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      const detailSessionId = String(detail.sessionId || detail.session?.id || '').trim();
      if (detailSessionId !== sessionId) return;
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: 'ended',
              endedAt: detail?.session?.endedAt || new Date().toISOString()
            }
          : prev
      );
    };

    const onJoined = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      if (String(detail.sessionId || '') !== sessionId) return;
      void loadSession();
    };

    window.addEventListener('live:reaction', onReaction as EventListener);
    window.addEventListener('live:viewer_count_updated', onViewer as EventListener);
    window.addEventListener('live:ended', onEnded as EventListener);
    window.addEventListener('live:participant_joined', onJoined as EventListener);
    window.addEventListener('live:participant_left', onJoined as EventListener);
    window.addEventListener('live:gift_sent', onJoined as EventListener);
    return () => {
      window.removeEventListener('live:reaction', onReaction as EventListener);
      window.removeEventListener('live:viewer_count_updated', onViewer as EventListener);
      window.removeEventListener('live:ended', onEnded as EventListener);
      window.removeEventListener('live:participant_joined', onJoined as EventListener);
      window.removeEventListener('live:participant_left', onJoined as EventListener);
      window.removeEventListener('live:gift_sent', onJoined as EventListener);
    };
  }, [loadSession, sessionId]);

  const sendReaction = useCallback(
    async (type: 'like' | 'love') => {
      if (!sessionId) return;
      try {
        const result = await LiveService.react(sessionId, type);
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            likesCount: Number(result?.likesCount ?? prev.likesCount ?? 0),
            lovesCount: Number(result?.lovesCount ?? prev.lovesCount ?? 0)
          };
        });
        const emoji = type === 'love' ? '❤️' : '👍';
        setFloatingReactions((prev) => [...prev.slice(-10), { id: `${Date.now()}-${Math.random()}`, emoji }]);
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to react.';
        showNotification('error', 'Livestream', message);
      }
    },
    [sessionId, showNotification]
  );

  const sendGift = useCallback(
    async (payload: { amountGcoin: number; message?: string }) => {
      if (!sessionId) return;
      try {
        setGiftSending(true);
        await LiveService.sendGift(sessionId, payload);
        showNotification('success', 'Livestream', 'Gift sent.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to send gift.';
        showNotification('error', 'Livestream', message);
      } finally {
        setGiftSending(false);
      }
    },
    [sessionId, showNotification]
  );

  const canPlayVideo = useMemo(() => Boolean(session?.hlsUrl || session?.streamUrl), [session?.hlsUrl, session?.streamUrl]);
  const status = String(session?.status || '').toLowerCase();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate('/live/studio')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Studio
        </button>
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white">
          <Radio className="h-3.5 w-3.5 text-rose-300" />
          {status === 'live' ? 'LIVE' : status ? status.toUpperCase() : 'SESSION'}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          Loading livestream...
        </div>
      ) : !session ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
          Livestream session not found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div
              className="relative overflow-hidden rounded-3xl border border-slate-200 bg-black"
              onDoubleClick={() => void sendReaction('like')}
            >
              {canPlayVideo ? (
                <video
                  ref={videoRef}
                  src={session.hlsUrl || session.streamUrl || undefined}
                  className="h-[58vh] w-full bg-black object-cover"
                  controls
                  autoPlay
                  playsInline
                  muted
                />
              ) : (
                <div className="flex h-[58vh] w-full items-center justify-center text-sm text-slate-300">
                  Stream preview is not available yet.
                </div>
              )}
              <div className="absolute left-3 top-3 rounded-xl bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
                {session.title || 'Untitled livestream'}
              </div>
              <div className="absolute right-3 top-3 rounded-xl bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
                👁 {Number(session.viewerCount || 0)}
              </div>
              <ReactionOverlay items={floatingReactions} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{session.title || 'Untitled livestream'}</h2>
              <p className="mt-1 text-sm text-slate-600">{session.description || 'No description provided.'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{String(session.visibility || 'public').toUpperCase()}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Viewers {Number(session.viewerCount || 0)}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Peak {Number(session.peakViewerCount || 0)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void sendReaction('like')}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> {Number(session.likesCount || 0)}
                </button>
                <button
                  type="button"
                  onClick={() => void sendReaction('love')}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Heart className="h-3.5 w-3.5" /> {Number(session.lovesCount || 0)}
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(window.location.href)}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Share
                </button>
              </div>
            </div>

            <ParticipantGrid participants={session.participants || []} />
          </div>

          <div className="space-y-4">
            <GiftPanel
              sending={giftSending}
              minAmount={1}
              maxAmount={50000}
              onSend={async (payload) => {
                await sendGift(payload);
              }}
            />
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Realtime events</p>
              <p className="mt-1 text-xs text-slate-500">
                Connected: {isConnected ? 'Yes' : 'No'} • Socket room: live:session:{session.id}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveViewer;
