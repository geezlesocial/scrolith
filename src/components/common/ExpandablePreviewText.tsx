import React, { useEffect, useMemo, useState } from 'react';
import { buildTextPreview, CARD_TEXT_PREVIEW_LIMIT } from '../../utils/textPreview';

type ExpandablePreviewTextProps = {
  text?: string | null;
  limit?: number;
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
  className = '',
  textClassName = '',
  buttonClassName = '',
  moreLabel = 'More',
  lessLabel = 'Less',
  allowCollapse = true,
  renderText
}) => {
  const source = String(text ?? '');
  const [expanded, setExpanded] = useState(false);
  const preview = useMemo(() => buildTextPreview(source, limit), [limit, source]);

  useEffect(() => {
    setExpanded(false);
  }, [limit, source]);

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
