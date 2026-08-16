import React, { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import SafeMessageText from './SafeMessageText';

export const LONG_MESSAGE_PREVIEW_LENGTH = 500;

export const getVisibleMessageText = (text: string, expanded: boolean): string => {
  if (expanded || text.length <= LONG_MESSAGE_PREVIEW_LENGTH) return text;
  return `${text.slice(0, LONG_MESSAGE_PREVIEW_LENGTH).trimEnd()}...`;
};

type ExpandableMessageTextProps = {
  messageId: string;
  text: string;
  outgoing?: boolean;
  mentionClassName?: string;
  navigate?: NavigateFunction;
};

const ExpandableMessageText: React.FC<ExpandableMessageTextProps> = ({
  messageId,
  text,
  outgoing = false,
  mentionClassName,
  navigate
}) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LONG_MESSAGE_PREVIEW_LENGTH;

  useEffect(() => {
    setExpanded(false);
  }, [messageId, text]);

  const visibleText = getVisibleMessageText(text, expanded);

  return (
    <>
      <SafeMessageText
        text={visibleText}
        outgoing={outgoing}
        navigate={navigate}
        mentionClassName={mentionClassName}
      />
      {isLong ? (
        <button
          type="button"
          className={[
            'mt-1 inline-flex min-h-7 items-center rounded-md px-1.5 py-0.5 text-xs font-semibold underline underline-offset-2',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
            outgoing
              ? 'text-blue-100 hover:text-white focus-visible:ring-white focus-visible:ring-offset-blue-600'
              : 'text-blue-700 hover:text-blue-900 focus-visible:ring-blue-500 focus-visible:ring-offset-white'
          ].join(' ')}
          aria-expanded={expanded}
          aria-label={expanded ? 'Show less of this message' : 'Show more of this message'}
          data-message-id={messageId}
          data-testid="message-text-toggle"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
        >
          {expanded ? 'Less' : 'More'}
        </button>
      ) : null}
    </>
  );
};

export default ExpandableMessageText;
