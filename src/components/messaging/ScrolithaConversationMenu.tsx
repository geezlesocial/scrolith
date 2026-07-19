/**
 * Phase 20.7.8 — Scrolitha-only conversation overflow menu + Accuracy / Media / Security panels.
 * Peer controls (mute, archive, delete, report/block, labels) are intentionally omitted.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  MoreVertical,
  Sparkles,
  Image as ImageIcon,
  Shield,
  X,
  Loader2,
  FileText,
  Video,
  Music,
  AlertTriangle,
  Send
} from 'lucide-react';
import api from '../../services/api';
import ScrolithaService from '../../services/scrolitha';
import { useNotification } from '../../context/NotificationContext';

type Panel = 'accuracy' | 'media' | 'security' | null;

type AttachmentItem = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  contentUrl?: string;
  mimeType?: string | null;
  size?: number | null;
};

type Props = {
  conversationId: string;
  dense?: boolean;
};

const ScrolithaConversationMenu: React.FC<Props> = ({ conversationId, dense }) => {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { showNotification } = useNotification();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [publicInfo, setPublicInfo] = useState<any>(null);
  const [security, setSecurity] = useState<any>(null);
  const [media, setMedia] = useState<AttachmentItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaType, setMediaType] = useState('all');
  const [feedback, setFeedback] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);

  const closeAll = useCallback(() => {
    setOpen(false);
    setPanel(null);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open && !panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, panel, closeAll]);

  const loadPublicInfo = useCallback(async () => {
    setInfoLoading(true);
    try {
      const res = await api.get('/scrolitha/public-info');
      setPublicInfo(res?.data?.data || res?.data || null);
    } catch {
      setPublicInfo(null);
    } finally {
      setInfoLoading(false);
    }
  }, []);

  const loadSecurity = useCallback(async () => {
    setInfoLoading(true);
    try {
      const res = await api.get(`/messages/conversations/${encodeURIComponent(conversationId)}/security`);
      setSecurity(res?.data?.data || res?.data || null);
    } catch {
      try {
        const res = await api.get('/scrolitha/message-security');
        setSecurity(res?.data?.data || res?.data || null);
      } catch {
        setSecurity(null);
      }
    } finally {
      setInfoLoading(false);
    }
  }, [conversationId]);

  const loadMedia = useCallback(async () => {
    setMediaLoading(true);
    try {
      const res = await api.get(`/messages/conversations/${encodeURIComponent(conversationId)}/attachments`, {
        params: { type: mediaType, limit: 40 }
      });
      const items = res?.data?.data?.items || res?.data?.items || [];
      setMedia(Array.isArray(items) ? items : []);
    } catch (e: any) {
      showNotification('error', 'Media', e?.response?.data?.error || 'Failed to load media');
      setMedia([]);
    } finally {
      setMediaLoading(false);
    }
  }, [conversationId, mediaType, showNotification]);

  useEffect(() => {
    if (panel === 'accuracy') void loadPublicInfo();
    if (panel === 'security') void loadSecurity();
    if (panel === 'media') void loadMedia();
  }, [panel, loadPublicInfo, loadSecurity, loadMedia]);

  const submitFeedback = async () => {
    const text = feedback.trim();
    if (!text) return;
    setFeedbackBusy(true);
    try {
      await ScrolithaService.feedback({
        conversationId,
        rating: 1,
        note: `[accuracy_report] ${text}`
      });
      showNotification('success', 'Feedback', 'Thank you — your feedback was submitted.');
      setFeedback('');
    } catch (e: any) {
      showNotification('error', 'Feedback', e?.response?.data?.error || 'Could not submit feedback');
    } finally {
      setFeedbackBusy(false);
    }
  };

  const openPanel = (next: Panel) => {
    setOpen(false);
    setPanel(next);
  };

  const iconFor = (type: string) => {
    if (type === 'photo') return <ImageIcon className="h-4 w-4 text-indigo-600" aria-hidden />;
    if (type === 'video') return <Video className="h-4 w-4 text-violet-600" aria-hidden />;
    if (type === 'audio') return <Music className="h-4 w-4 text-emerald-600" aria-hidden />;
    return <FileText className="h-4 w-4 text-slate-600" aria-hidden />;
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700',
          dense ? 'h-9 w-9' : 'h-10 w-10'
        ].join(' ')}
        title="Scrolitha options"
      >
        <MoreVertical className={dense ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />
        <span className="sr-only">Open Scrolitha conversation menu</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-11 z-30 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">Scrolitha</p>
            <p className="text-xs text-slate-500">Official AI assistant controls</p>
          </div>
          <div className="p-1.5">
            <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              AI Information
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={() => openPanel('accuracy')}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-indigo-50"
            >
              <Sparkles className="h-4 w-4 text-indigo-600" aria-hidden />
              <span>
                <span className="block font-medium text-slate-900">Accuracy</span>
                <span className="block text-xs text-slate-500">AI limits and feedback</span>
              </span>
            </button>
            <p className="mt-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Media &amp; Files
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={() => openPanel('media')}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-indigo-50"
            >
              <ImageIcon className="h-4 w-4 text-indigo-600" aria-hidden />
              <span>
                <span className="block font-medium text-slate-900">Media and Files</span>
                <span className="block text-xs text-slate-500">Shared in this conversation</span>
              </span>
            </button>
            <p className="mt-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Privacy &amp; Support
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={() => openPanel('security')}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-indigo-50"
            >
              <Shield className="h-4 w-4 text-indigo-600" aria-hidden />
              <span>
                <span className="block font-medium text-slate-900">Verify End-to-End Encryption</span>
                <span className="block text-xs text-slate-500">Honest security status</span>
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {panel ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${menuId}-panel-title`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAll();
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 id={`${menuId}-panel-title`} className="text-base font-bold text-slate-900">
                {panel === 'accuracy' && 'AI Accuracy'}
                {panel === 'media' && 'Media and Files'}
                {panel === 'security' && 'Message security'}
              </h2>
              <button
                type="button"
                onClick={closeAll}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {infoLoading || mediaLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                  Loading…
                </div>
              ) : null}

              {panel === 'accuracy' && !infoLoading ? (
                <div className="space-y-4 text-sm text-slate-700">
                  <p className="rounded-xl bg-amber-50 p-3 text-amber-900">
                    <AlertTriangle className="mb-1 inline h-4 w-4" aria-hidden />{' '}
                    {publicInfo?.accuracyNotice ||
                      'Scrolitha responses are generated by AI and may contain mistakes.'}
                  </p>
                  <div>
                    <h3 className="font-semibold text-slate-900">Verify important information</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                      <li>Job terms and contracts</li>
                      <li>Financial or payment instructions</li>
                      <li>Legal or medical matters</li>
                      <li>High-impact business decisions</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Capability status</h3>
                    <ul className="mt-2 space-y-2">
                      {(publicInfo?.capabilities || []).map((c: any) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                        >
                          <span>{c.label}</span>
                          <span className="text-xs font-semibold uppercase text-slate-500">
                            {c.statusLabel ||
                              (c.status === 'available'
                                ? 'Available'
                                : c.status === 'available_with_confirmation'
                                  ? 'Available with confirmation'
                                  : c.status === 'limited'
                                    ? 'Limited'
                                    : 'Not currently available')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Report an inaccurate response</h3>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      placeholder="Describe what was wrong…"
                    />
                    <button
                      type="button"
                      disabled={feedbackBusy || !feedback.trim()}
                      onClick={() => void submitFeedback()}
                      className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {feedbackBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden />
                      )}
                      Submit feedback
                    </button>
                  </div>
                </div>
              ) : null}

              {panel === 'media' && !mediaLoading ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {['all', 'photos', 'videos', 'audio', 'documents'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMediaType(t)}
                        className={[
                          'rounded-full px-3 py-1 text-xs font-semibold capitalize',
                          mediaType === t
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        ].join(' ')}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {!media.length ? (
                    <p className="py-10 text-center text-sm text-slate-500">
                      No media or files in this conversation yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                      {media.map((item) => (
                        <li key={`${item.messageId || ''}-${item.id}`} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50">
                            {iconFor(item.type)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                            <p className="text-xs text-slate-500">
                              {item.type} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                            </p>
                          </div>
                          {item.contentUrl ? (
                            <a
                              href={item.contentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-indigo-600 hover:underline"
                            >
                              Open
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {panel === 'security' && !infoLoading ? (
                <div className="space-y-4 text-sm text-slate-700">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="font-semibold text-amber-900">End-to-end encryption not available</p>
                    <p className="mt-1 text-amber-800">
                      {security?.verification?.message ||
                        security?.messageSecurityModel ||
                        'Verification is unavailable for Scrolitha under the current architecture.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Actual security model</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                      <li>
                        Transport: {security?.transport?.protocol || 'HTTPS/TLS'} — client to Scrolith
                        servers
                      </li>
                      <li>
                        Server processing: message content is readable by Scrolith servers so Scrolitha
                        can reply
                      </li>
                      <li>AI orchestration processes authorized conversation text and attachments</li>
                      <li>No device safety numbers or E2EE key verification exist for this chat</li>
                    </ul>
                  </div>
                  {(security?.userGuidance || []).length ? (
                    <div>
                      <h3 className="font-semibold text-slate-900">Guidance</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                        {(security.userGuidance as string[]).map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    Audit finding: {security?.auditLabel || 'Transport and storage encryption only'} (
                    {security?.auditFinding || 'B'})
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ScrolithaConversationMenu;
