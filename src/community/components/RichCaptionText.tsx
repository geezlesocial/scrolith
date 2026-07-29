import React from 'react';
import { Link } from 'react-router-dom';

type RichCaptionTextProps = {
  text?: string | null;
  className?: string;
  preserveWhitespace?: boolean;
};

const TOKEN_REGEX = /(^|[\s([{>])(@[a-zA-Z0-9_.]{2,30}|#[a-zA-Z0-9_]{1,40})/g;

const RichCaptionText: React.FC<RichCaptionTextProps> = ({
  text,
  className = '',
  preserveWhitespace = true
}) => {
  const source = String(text || '');
  if (!source.trim()) return null;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  source.replace(TOKEN_REGEX, (match, prefix: string, token: string, offset: number) => {
    const tokenStart = offset + prefix.length;
    if (tokenStart > lastIndex) {
      parts.push(source.slice(lastIndex, tokenStart));
    }

    const isMention = token.startsWith('@');
    const rawValue = token.slice(1);
    const href = isMention
      ? `/u/${encodeURIComponent(rawValue)}`
      : `/search?q=${encodeURIComponent(token)}`;
    const tokenClassName = isMention
      ? 'font-semibold text-sky-200 underline-offset-2 hover:text-white hover:underline'
      : 'font-semibold text-cyan-200 underline-offset-2 hover:text-white hover:underline';

    parts.push(
      <Link
        key={`caption-token-${tokenStart}-${token}`}
        to={href}
        className={tokenClassName}
        data-inline-video-control="true"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
      >
        {token}
      </Link>
    );
    lastIndex = tokenStart + token.length;
    return match;
  });

  if (lastIndex < source.length) {
    parts.push(source.slice(lastIndex));
  }

  return (
    <span className={`${preserveWhitespace ? 'whitespace-pre-wrap break-words' : 'break-words'} ${className}`.trim()}>
      {parts}
    </span>
  );
};

export default RichCaptionText;
