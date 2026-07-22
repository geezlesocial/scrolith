import React from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { splitTextWithMentions } from '../../utils/messageMentions';
import { openSafeExternalMessageUrl, tokenizeMessageLinks } from '../../utils/messageLinks';

type SafeMessageTextProps = {
  text: string;
  className?: string;
  outgoing?: boolean;
  mentionClassName?: string;
  navigate?: NavigateFunction;
};

const renderMentionAwareText = (text: string, keyPrefix: string, mentionClassName?: string) =>
  splitTextWithMentions(text).map((segment, index) =>
    segment.type === 'mention' ? (
      <span key={`${keyPrefix}-mention-${index}`} className={mentionClassName || 'font-semibold text-indigo-600'}>
        {segment.value}
      </span>
    ) : (
      <React.Fragment key={`${keyPrefix}-text-${index}`}>{segment.value}</React.Fragment>
    )
  );

const SafeMessageText: React.FC<SafeMessageTextProps> = ({
  text,
  className,
  outgoing = false,
  mentionClassName,
  navigate
}) => {
  const tokens = tokenizeMessageLinks(text);
  const linkClassName = [
    'inline-flex max-w-full items-center gap-1 rounded-sm underline decoration-current/60 underline-offset-2 outline-none',
    'break-all [overflow-wrap:anywhere] focus-visible:ring-2 focus-visible:ring-offset-2',
    outgoing
      ? 'font-semibold text-white focus-visible:ring-white/80 focus-visible:ring-offset-blue-600'
      : 'font-semibold text-blue-700 focus-visible:ring-blue-500 focus-visible:ring-offset-white'
  ].join(' ');

  return (
    <span className={className}>
      {tokens.map((token, index) => {
        if (token.type === 'text') {
          return renderMentionAwareText(token.value, `message-link-${index}`, mentionClassName);
        }

        const isInternal = Boolean(token.internalPath && navigate);
        const ariaLabel = isInternal
          ? `Open ${token.value} in Scrolith`
          : `Opens ${token.hostname} in a new window`;
        return (
          <a
            key={`message-url-${index}-${token.href}`}
            href={token.href}
            className={linkClassName}
            target={isInternal ? undefined : '_blank'}
            rel={isInternal ? undefined : 'noopener noreferrer nofollow'}
            title={ariaLabel}
            aria-label={ariaLabel}
            onClick={(event) => {
              event.stopPropagation();
              if (isInternal && token.internalPath && navigate) {
                event.preventDefault();
                navigate(token.internalPath);
                return;
              }
              if (!isInternal) {
                if ((window as any)?.Capacitor) {
                  event.preventDefault();
                  void openSafeExternalMessageUrl(token.href);
                }
              }
            }}
          >
            <span>{token.value}</span>
            {!isInternal ? <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" /> : null}
          </a>
        );
      })}
    </span>
  );
};

export default SafeMessageText;
