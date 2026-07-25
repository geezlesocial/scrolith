import React from 'react';
import {
  resolvePostPresentation,
  shouldRenderTextBackground
} from '../../utils/postTextBackgrounds';

type Props = {
  post: any;
  content: string;
  children?: React.ReactNode;
  className?: string;
};

/**
 * Renders text-only posts with Facebook-style full-bleed background.
 * Falls back to children when no presentation applies.
 */
export const PostTextBackgroundBody: React.FC<Props> = ({
  post,
  content,
  children,
  className = ''
}) => {
  if (!shouldRenderTextBackground(post)) {
    return <>{children}</>;
  }
  const presentation = resolvePostPresentation(post);
  if (!presentation) return <>{children}</>;

  const text = String(content || '').trim();
  if (!text) return <>{children}</>;

  return (
    <div
      className={`my-3 overflow-hidden rounded-2xl ${className}`}
      data-testid="post-text-background-body"
      style={{ background: presentation.background }}
    >
      <div
        className="flex min-h-[200px] items-center justify-center px-5 py-10 text-center sm:min-h-[240px] sm:px-8 sm:py-12"
        style={{ color: presentation.textColor }}
      >
        <p className="max-w-xl whitespace-pre-wrap break-words text-xl font-semibold leading-snug sm:text-2xl md:text-3xl">
          {text}
        </p>
      </div>
    </div>
  );
};

export default PostTextBackgroundBody;
