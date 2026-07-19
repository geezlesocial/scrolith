import React, { useEffect, useMemo, useState } from 'react';
import { buildTextPreview, CARD_TEXT_PREVIEW_LIMIT } from '../../utils/textPreview';
import {
  postCardBodyClampClass,
  postCardBodyExpandedClass,
  postCardTokens
} from '../enterprise/postCardDesign';

type ExpandablePreviewTextProps = {
  text?: string | null;
  limit?: number;
  /**
   * When set, collapse by CSS line-clamp (preferred for feed consistency).
   * Defaults to design-system body max lines (5) when useLineClamp is true.
   */
  maxLines?: number;
  /** Prefer line-clamp over character truncation for stable card height */
  useLineClamp?: boolean;
  className?: string;
  textClassName?: string;
  buttonClassName?: string;
  moreLabel?: string;
  lessLabel?: string;
  allowCollapse?: boolean;
  renderText?: (visibleText: string, expanded: boolean, isTruncated: boolean) => React.ReactNode;
};

const ExpandablePreviewText: React.FC<ExpandablePreviewTextProps> = ({
  text,
  limit = CARD_TEXT_PREVIEW_LIMIT,
  maxLines = postCardTokens.bodyMaxLines,
  useLineClamp = false,
  className = '',
  textClassName = '',
  buttonClassName = '',
  moreLabel = 'More...',
  lessLabel = 'Less',
  allowCollapse = true,
  renderText
}) => {
  const source = String(text ?? '');
  const [expanded, setExpanded] = useState(false);
  const preview = useMemo(() => buildTextPreview(source, limit), [limit, source]);
  const [overflowsClamp, setOverflowsClamp] = useState(false);
  const measureRef = React.useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    setExpanded(false);
  }, [limit, source, maxLines]);

  useEffect(() => {
    if (!useLineClamp || expanded) return;
    const el = measureRef.current;
    if (!el) return;
    // Detect clamp overflow so More... only shows when needed
    const check = () => {
      setOverflowsClamp(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, source, useLineClamp, maxLines, textClassName]);

  if (useLineClamp) {
    const showToggle = overflowsClamp || (expanded && allowCollapse);
    const clampStyle = !expanded
      ? ({
          display: '-webkit-box',
          WebkitLineClamp: maxLines,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden'
        } as React.CSSProperties)
      : undefined;
    const bodyClass = expanded ? postCardBodyExpandedClass : postCardBodyClampClass;

    return (
      <div className={className} data-preview-mode="line-clamp" data-expanded={expanded ? 'true' : 'false'}>
        <span
          ref={measureRef}
          className={`${bodyClass} ${textClassName}`.trim()}
          style={clampStyle}
        >
          {renderText ? renderText(source, expanded, overflowsClamp || expanded) : source}
        </span>
        {showToggle ? (
          <button
            type="button"
            className={`mt-1 inline-flex text-sm font-semibold hover:underline ${buttonClassName}`.trim()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setExpanded((current) => (allowCollapse ? !current : true));
            }}
            aria-expanded={expanded}
          >
            {expanded ? lessLabel : moreLabel}
          </button>
        ) : null}
      </div>
    );
  }

  const visibleText = expanded || !preview.isTruncated ? source : preview.text;
  const canToggle = preview.isTruncated && (!expanded || allowCollapse);

  return (
    <div className={className}>
      {renderText ? (
        renderText(visibleText, expanded, preview.isTruncated)
      ) : (
        <span className={`whitespace-pre-wrap break-words ${textClassName}`.trim()}>{visibleText}</span>
      )}
      {canToggle ? (
        <button
          type="button"
          className={`ml-2 inline-flex text-sm font-semibold hover:underline ${buttonClassName}`.trim()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((current) => (allowCollapse ? !current : true));
          }}
          aria-expanded={expanded}
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  );
};

export default ExpandablePreviewText;
