import React from 'react';
import { Sparkles } from 'lucide-react';
import {
  postCardAiCoachButtonClass,
  postCardAiCoachClass,
  postCardAiCoachInnerClass
} from './postCardDesign';

type PostAiCoachCardProps = {
  onEnhance: (event: React.MouseEvent<HTMLButtonElement>) => void;
  description?: string;
  className?: string;
};

/**
 * Stable AI Coach strip on post cards — min-height 72px, padding 16px,
 * CTA always right-aligned. Same footprint on every surface.
 */
const PostAiCoachCard: React.FC<PostAiCoachCardProps> = ({
  onEnhance,
  description = 'Get recommendation prompts for stronger reach, clarity, and conversion.',
  className = ''
}) => (
  <div
    className={`${postCardAiCoachClass} ${className}`.trim()}
    data-testid="post-ai-coach-card"
  >
    <div className={postCardAiCoachInnerClass}>
      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Scrolitha coach
        </span>
        <p className="mt-1 line-clamp-2 text-xs leading-snug text-slate-600">{description}</p>
      </div>
      <button
        type="button"
        onClick={onEnhance}
        className={postCardAiCoachButtonClass}
        data-testid="post-ai-coach-enhance"
      >
        Enhance post
      </button>
    </div>
  </div>
);

export default React.memo(PostAiCoachCard);
