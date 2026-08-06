import React, { useMemo } from 'react';
import {
  listingBodyLooksLikeHtml,
  listingBodyToPlainPreview,
  normalizeListingPlainText,
  sanitizeListingHtml
} from '../utils/listingBodyFormat';

type ListingBodyContentProps = {
  content?: string | null;
  /** Card / list preview mode collapses to a short plain excerpt. */
  preview?: boolean;
  previewMaxLength?: number;
  className?: string;
  emptyFallback?: string;
  as?: 'div' | 'p' | 'span';
};

const PROSE_CLASSES =
  'prose prose-slate max-w-none text-gray-700 leading-7 ' +
  'prose-p:my-3 prose-p:leading-7 prose-headings:font-semibold prose-headings:text-gray-900 ' +
  'prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:leading-7 ' +
  'prose-strong:text-gray-900 break-words';

const PLAIN_CLASSES =
  'text-gray-700 leading-7 whitespace-pre-wrap break-words [overflow-wrap:anywhere]';

/**
 * Renders job/gig description bodies with professional spacing:
 * - Plain text keeps author newlines and paragraph gaps
 * - Light HTML keeps structure (p/ul/br) without scripts
 * - Preview mode is plain, single-flow excerpt for cards
 */
const ListingBodyContent: React.FC<ListingBodyContentProps> = ({
  content,
  preview = false,
  previewMaxLength = 220,
  className = '',
  emptyFallback = '',
  as = 'div'
}) => {
  const Tag = as;

  const rendered = useMemo(() => {
    const raw = String(content ?? '');
    if (!raw.trim()) {
      return { mode: 'empty' as const, text: emptyFallback };
    }
    if (preview) {
      const plain = listingBodyToPlainPreview(raw, previewMaxLength);
      return { mode: 'plain' as const, text: plain || emptyFallback };
    }
    if (listingBodyLooksLikeHtml(raw)) {
      return { mode: 'html' as const, html: sanitizeListingHtml(raw) };
    }
    return { mode: 'plain' as const, text: normalizeListingPlainText(raw) };
  }, [content, emptyFallback, preview, previewMaxLength]);

  if (rendered.mode === 'empty' || (rendered.mode === 'plain' && !rendered.text)) {
    if (!emptyFallback) return null;
    return <Tag className={`${PLAIN_CLASSES} ${className}`.trim()}>{emptyFallback}</Tag>;
  }

  if (rendered.mode === 'html') {
    return (
      <Tag
        className={`${PROSE_CLASSES} ${className}`.trim()}
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    );
  }

  return <Tag className={`${PLAIN_CLASSES} ${className}`.trim()}>{rendered.text}</Tag>;
};

export default ListingBodyContent;
