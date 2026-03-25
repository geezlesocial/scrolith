import React, { useMemo } from 'react';
import { buildTextPreview, CARD_TEXT_PREVIEW_LIMIT } from '../../utils/textPreview';

type StaticPreviewTextProps = {
  text?: string | null;
  limit?: number;
  className?: string;
  textClassName?: string;
  moreLabel?: string;
  moreClassName?: string;
};

const StaticPreviewText: React.FC<StaticPreviewTextProps> = ({
  text,
  limit = CARD_TEXT_PREVIEW_LIMIT,
  className = '',
  textClassName = '',
  moreLabel = 'More',
  moreClassName = ''
}) => {
  const source = String(text ?? '');
  const preview = useMemo(() => buildTextPreview(source, limit), [limit, source]);

  return (
    <span className={className}>
      <span className={`whitespace-pre-wrap break-words ${textClassName}`.trim()}>{preview.text}</span>
      {preview.isTruncated ? (
        <span className={`ml-1 font-semibold ${moreClassName}`.trim()}>{moreLabel}</span>
      ) : null}
    </span>
  );
};

export default StaticPreviewText;
