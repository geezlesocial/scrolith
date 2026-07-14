import React from 'react';

type Props = {
  children: React.ReactNode;
  /** CSS aspect-ratio value, e.g. "16 / 9" or "1 / 1" */
  aspectRatio?: string;
  className?: string;
  rounded?: string;
};

/**
 * Fixed aspect frame that reserves space before media loads (reduces layout shift).
 */
const StableMediaFrame: React.FC<Props> = ({
  children,
  aspectRatio = '16 / 9',
  className = '',
  rounded = 'rounded-xl'
}) => (
  <div
    className={`relative w-full overflow-hidden bg-slate-100 ${rounded} ${className}`.trim()}
    style={{ aspectRatio }}
  >
    <div className="absolute inset-0">{children}</div>
  </div>
);

export default StableMediaFrame;
