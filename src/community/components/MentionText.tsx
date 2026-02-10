import React from 'react';
import { Link } from 'react-router-dom';

type MentionTextProps = {
  text?: string | null;
  className?: string;
  mentionToken?: string;
  viewerId?: string | null;
  viewerUsername?: string | null;
  preserveWhitespace?: boolean;
};

const MENTION_REGEX = /@([a-zA-Z0-9_.]{3,30})/g;

const normalizeToken = (value?: string | null) => String(value || '').trim().replace(/^@+/, '').toLowerCase();

const isHighlightedMention = (mentionUsername: string, token: string, viewerId: string, viewerUsername: string) => {
  if (!token) return false;
  if (token === mentionUsername) return true;
  if (token === viewerUsername && mentionUsername === viewerUsername) return true;
  if (token === viewerId && viewerUsername && mentionUsername === viewerUsername) return true;
  return false;
};

const MentionText: React.FC<MentionTextProps> = ({
  text,
  className = '',
  mentionToken,
  viewerId,
  viewerUsername,
  preserveWhitespace = true
}) => {
  const source = String(text || '');
  if (!source) {
    return <span className={className} />;
  }

  const token = normalizeToken(mentionToken);
  const normalizedViewerId = normalizeToken(viewerId);
  const normalizedViewerUsername = normalizeToken(viewerUsername);
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  source.replace(MENTION_REGEX, (match, username, offset: number) => {
    if (offset > lastIndex) {
      parts.push(source.slice(lastIndex, offset));
    }
    const normalizedMention = normalizeToken(username);
    const highlighted = isHighlightedMention(normalizedMention, token, normalizedViewerId, normalizedViewerUsername);
    const mentionClasses = highlighted
      ? 'rounded bg-amber-100 px-1 font-semibold text-amber-700'
      : 'font-semibold text-blue-600 hover:underline';
    parts.push(
      <Link key={`mention-${offset}-${username}`} to={`/u/${encodeURIComponent(String(username))}`} className={mentionClasses}>
        {match}
      </Link>
    );
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < source.length) {
    parts.push(source.slice(lastIndex));
  }

  const mergedClassName = `${preserveWhitespace ? 'whitespace-pre-wrap break-words' : ''} ${className}`.trim();
  return <span className={mergedClassName}>{parts}</span>;
};

export default MentionText;
