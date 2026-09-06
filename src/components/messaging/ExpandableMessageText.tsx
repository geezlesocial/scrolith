import React, { useMemo, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import SafeMessageText from './SafeMessageText';
import {
  countMessageWords,
  MAX_MESSAGE_WORDS,
  truncateMessageWords
} from '../../utils/messageText';

type ExpandableMessageTextProps = {
  text: string;
  outgoing?: boolean;
  navigate?: NavigateFunction;
  mentionClassName?: string;
  className?: string;
  onToggle?: (expanded: boolean) => void;
};

/**
 * Keeps ordinary messages fully readable while preventing an unusually large
 * historical payload from taking over a mobile viewport. The server and
 * composer accept 500 words; older messages over that boundary remain
 * accessible through the explicit disclosure control.
 */
const ExpandableMessageText: React.FC<ExpandableMessageTextProps> = ({
  text,
  outgoing = false,
  navigate,
  mentionClassName,
  className,
  onToggle
}) => {
  const [expanded, setExpanded] = useState(false);
  const wordCount = useMemo(() => countMessageWords(text), [text]);
  const collapsed = wordCount > MAX_MESSAGE_WORDS;
  const visibleText = collapsed && !expanded ? truncateMessageWords(text) : text;

  return (
    <span className={className}>
      <SafeMessageText
        text={visibleText}
        outgoing={outgoing}
        navigate={navigate}
        mentionClassName={mentionClassName}
      />
      {collapsed ? (
        <button
          type="button"
          className={[
            'ml-1.5 inline-flex min-h-[32px] items-center rounded-md px-1.5 text-xs font-semibold underline underline-offset-2',
            outgoing ? 'text-blue-100 hover:text-white' : 'text-blue-700 hover:text-blue-800'
          ].join(' ')}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const next = !expanded;
            setExpanded(next);
            onToggle?.(next);
          }}
          aria-expanded={expanded}
          aria-label={expanded ? 'Show less of message' : 'Show more of message'}
        >
          {expanded ? 'Less' : 'More'}
        </button>
      ) : null}
    </span>
  );
};

export default ExpandableMessageText;
