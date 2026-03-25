import React from 'react'

type PostOriginPreviewProps = {
  originalPost?: {
    id?: string
    authorName?: string | null
    authorUsername?: string | null
    title?: string | null
    content?: string | null
  } | null
  variant?: 'light' | 'dark'
  className?: string
}

const PostOriginPreview: React.FC<PostOriginPreviewProps> = ({
  originalPost,
  variant = 'light',
  className = ''
}) => {
  if (!originalPost?.id) return null

  const title = String(originalPost.title || '').trim()
  const content = String(originalPost.content || '').trim()
  const previewText = title || content
  const authorLabel =
    String(originalPost.authorName || '').trim() ||
    String(originalPost.authorUsername || '').trim() ||
    'Original author'

  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        variant === 'dark'
          ? 'border-white/10 bg-white/6 text-white'
          : 'border-slate-200 bg-slate-50/70 text-slate-900'
      } ${className}`.trim()}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
          variant === 'dark' ? 'text-white/65' : 'text-slate-500'
        }`}
      >
        Reposted from {authorLabel}
      </p>
      {previewText ? (
        <p
          className={`mt-2 line-clamp-3 text-sm leading-6 ${
            variant === 'dark' ? 'text-white/90' : 'text-slate-700'
          }`}
        >
          {previewText}
        </p>
      ) : (
        <p className={`mt-2 text-sm ${variant === 'dark' ? 'text-white/80' : 'text-slate-600'}`}>
          Original post available in the feed history.
        </p>
      )}
    </div>
  )
}

export default PostOriginPreview
