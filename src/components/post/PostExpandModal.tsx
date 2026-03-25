import React, { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';

import MentionText from '../../community/components/MentionText';
import GraphicWarningGate from '../media/GraphicWarningGate';

type ExpandedPostAttachment = {
  id?: string | null;
  url?: string | null;
  name?: string | null;
  mimeType?: string | null;
  type?: string | null;
  thumbnailUrl?: string | null;
};

type ExpandedPost = {
  id?: string | null;
  title?: string | null;
  content?: string | null;
  createdAt?: string | null;
  authorName?: string | null;
  authorUsername?: string | null;
  authorAvatar?: string | null;
  visibility?: string | null;
  tags?: string[];
  topic?: string | null;
  location?: string | null;
  graphicWarning?: boolean;
  aiInsightGenerated?: boolean;
  aiInsightText?: string | null;
  attachments?: ExpandedPostAttachment[];
};

type PostExpandModalProps = {
  open: boolean;
  post: ExpandedPost | null;
  viewerId?: string | null;
  viewerUsername?: string | null;
  onClose: () => void;
};

const inferMediaType = (media: ExpandedPostAttachment | null | undefined) => {
  if (!media) return 'document';
  const explicit = String(media.type || '').toLowerCase();
  if (explicit === 'image' || explicit === 'video' || explicit === 'document') return explicit;
  const mime = String(media.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  const url = String(media.url || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(url)) return 'image';
  if (/\.(mp4|webm|mov|m4v|ogg)$/.test(url)) return 'video';
  return 'document';
};

const formatCreatedAt = (value: string | null | undefined) => {
  if (!value) return 'Recently';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently';
  return new Date(timestamp).toLocaleString();
};

const PostExpandModal: React.FC<PostExpandModalProps> = ({
  open,
  post,
  viewerId,
  viewerUsername,
  onClose
}) => {
  const [graphicRevealed, setGraphicRevealed] = useState(false);

  useEffect(() => {
    setGraphicRevealed(false);
  }, [post?.id, open]);

  if (!open || !post) return null;

  const authorName = String(post.authorName || 'Member').trim() || 'Member';
  const authorUsername = String(post.authorUsername || '').trim().replace(/^@+/, '');
  const authorAvatar = String(post.authorAvatar || '').trim();
  const attachments = Array.isArray(post.attachments)
    ? post.attachments.filter((item) => String(item?.url || '').trim())
    : [];
  const singleAttachment = attachments.length === 1;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close expanded post"
        onClick={onClose}
      />
      <div className="relative z-[1] flex h-[92svh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-[2rem]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                {authorAvatar ? (
                  <img src={authorAvatar} alt={authorName} className="h-full w-full object-cover" />
                ) : (
                  <span>{authorName.charAt(0).toUpperCase() || 'M'}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{authorName}</p>
                <p className="truncate text-xs text-slate-500">
                  {authorUsername ? `@${authorUsername} - ` : ''}
                  {formatCreatedAt(post.createdAt)}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            aria-label="Close expanded post"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mx-auto w-full max-w-3xl space-y-4">
            {post.title ? (
              <h2 className="text-2xl font-semibold leading-tight tracking-tight text-slate-950 [overflow-wrap:anywhere]">
                {post.title}
              </h2>
            ) : null}

            {post.content ? (
              <div className="text-[15px] leading-7 text-slate-700 [overflow-wrap:anywhere]">
                <MentionText
                  text={String(post.content)}
                  viewerId={viewerId}
                  viewerUsername={viewerUsername}
                />
              </div>
            ) : null}

            {post.aiInsightGenerated && post.aiInsightText ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">AI Insight</p>
                <p className="mt-2 text-sm text-emerald-950">{post.aiInsightText}</p>
              </div>
            ) : null}

            {(post.topic || post.location || post.visibility || (post.tags || []).length > 0) ? (
              <div className="flex flex-wrap gap-2">
                {post.visibility ? (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                    {post.visibility}
                  </span>
                ) : null}
                {post.topic ? (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                    Topic: {post.topic}
                  </span>
                ) : null}
                {post.location ? (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                    Location: {post.location}
                  </span>
                ) : null}
                {(post.tags || []).slice(0, 12).map((tag) => (
                  <span
                    key={`${post.id || 'post'}_tag_${tag}`}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}

            {attachments.length ? (
              <GraphicWarningGate
                active={Boolean(post.graphicWarning)}
                revealed={!post.graphicWarning || graphicRevealed}
                onReveal={() => setGraphicRevealed(true)}
                className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-3"
                contentClassName="space-y-3"
              >
                <div className={`grid gap-3 ${singleAttachment ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
                  {attachments.map((attachment) => {
                    const mediaType = inferMediaType(attachment);
                    if (mediaType === 'image') {
                      return (
                        <div
                          key={String(attachment.id || attachment.url)}
                          className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white"
                        >
                          <img
                            src={String(attachment.url)}
                            alt={attachment.name || 'Post media'}
                            className="max-h-[70svh] w-full object-contain bg-slate-100"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      );
                    }

                    if (mediaType === 'video') {
                      return (
                        <div
                          key={String(attachment.id || attachment.url)}
                          className="rounded-[1.25rem] border border-slate-200 bg-slate-950/95 p-4 text-white"
                        >
                          <p className="text-sm font-semibold">Video posts open in Scrolls</p>
                          <p className="mt-2 text-xs text-white/70">
                            Tap the video card in the feed to enter the Scroll viewer and continue watching more videos.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <a
                        key={String(attachment.id || attachment.url)}
                        href={String(attachment.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <span className="min-w-0 truncate">{attachment.name || 'Open attachment'}</span>
                        <ExternalLink className="ml-3 h-4 w-4 shrink-0" />
                      </a>
                    );
                  })}
                </div>
              </GraphicWarningGate>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostExpandModal;
