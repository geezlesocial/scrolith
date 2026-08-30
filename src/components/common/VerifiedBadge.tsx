import React from "react";

export type VerifiedBadgeProps = {
  size?: number | "xs" | "sm" | "md" | "lg";
  level?: unknown;
  className?: string;
  showTooltip?: boolean;
  animated?: boolean;
  subjectRole?: string | null;
  subjectType?: string | null;
  entity?: unknown;
  title?: string;
  ariaHidden?: boolean;
};

const namedSizeMap = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
} as const;

function resolveBadgeSize(size: VerifiedBadgeProps["size"]): number {
  if (typeof size === "number") return size;
  if (typeof size === "string" && size in namedSizeMap) {
    return (namedSizeMap as Record<string, number>)[size];
  }
  return namedSizeMap.sm;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  size = "sm",
  className = "",
  title = "Verified account",
  ariaHidden = false,
}) => {
  const pixelSize = resolveBadgeSize(size as VerifiedBadgeProps['size']);

  return (
    <span
      className={`inline-flex items-center justify-center align-middle ml-1.5 shrink-0 ${className}`.trim()}
      title={ariaHidden ? undefined : title}
      aria-label={ariaHidden ? undefined : title}
      aria-hidden={ariaHidden ? true : undefined}
      style={{ width: pixelSize, height: pixelSize }}
    >
      <img
        src="/assets/icons/scrolith-verified-badge.png"
        alt={ariaHidden ? "" : title}
        width={pixelSize}
        height={pixelSize}
        loading="lazy"
        fetchPriority="low"
        decoding="async"
        className="block object-contain"
        style={{
          width: pixelSize,
          height: pixelSize,
          objectFit: "contain",
          imageRendering: "auto",
        }}
      />
    </span>
  );
};

export default VerifiedBadge;
