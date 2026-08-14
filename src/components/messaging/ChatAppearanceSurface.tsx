import React, { forwardRef, useMemo } from 'react';
import {
  appearanceToBackgroundStyle,
  buildChatPalette,
  paletteToCssVars,
  type AppearanceInput
} from '../../services/messaging/chatTextColorEngine';

type ChatAppearanceSurfaceProps = {
  appearance: AppearanceInput | null | undefined;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
  testId: string;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
};

/**
 * Owns the visible chat background layer. Keeping the background and palette
 * on the same rendered surface prevents dock/header wrappers from masking a
 * saved appearance while leaving message content fully opaque.
 */
const ChatAppearanceSurface = forwardRef<HTMLDivElement, ChatAppearanceSurfaceProps>(
  ({ appearance, className = '', contentClassName = '', children, testId, onScroll }, ref) => {
    const backgroundStyle = useMemo(() => appearanceToBackgroundStyle(appearance), [appearance]);
    const paletteStyle = useMemo(() => paletteToCssVars(buildChatPalette(appearance)), [appearance]);
    const kind = String(appearance?.kind || 'none').toLowerCase();

    return (
      <div
        ref={ref}
        onScroll={onScroll}
        className={`relative isolate bg-transparent ${className}`}
        style={paletteStyle as React.CSSProperties}
        data-testid={testId}
        data-chat-appearance-kind={kind}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={backgroundStyle}
          data-testid={`${testId}-background`}
        />
        <div className={`relative z-[1] min-h-full ${contentClassName}`}>{children}</div>
      </div>
    );
  }
);

ChatAppearanceSurface.displayName = 'ChatAppearanceSurface';

export default ChatAppearanceSurface;
