import React from 'react';
import { usePreloader } from '../context/PreloaderContext';
import { resolveOptimizedStaticImageUrl } from '../utils/assetUrl';

const BRAND_PRELOADER_LOGO_URL = '/preloader-logo.png';

const hexToRgb = (hex: string) => {
  const raw = String(hex || '').replace('#', '').trim();
  if (raw.length !== 3 && raw.length !== 6) return null;
  const full = raw.length === 3 ? raw.split('').map((c) => `${c}${c}`).join('') : raw;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const toRgba = (hex: string, alpha: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(15,23,42,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const parseCustomCss = (css?: string | null): React.CSSProperties => {
  if (!css) return {};
  const style: Record<string, string> = {};
  css
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [property, ...rest] = entry.split(':');
      if (!property || !rest.length) return;
      const value = rest.join(':').trim();
      const camelProperty = property
        .trim()
        .toLowerCase()
        .split('-')
        .map((part, index) => (index === 0 ? part : part[0]?.toUpperCase() + part.slice(1)))
        .join('');
      if (!camelProperty) return;
      style[camelProperty] = value;
    });
  return style as React.CSSProperties;
};

const GlobalPreloader: React.FC = () => {
  const { config, isVisible } = usePreloader();

  if (!isVisible) return null;

  const animationDuration = `${(1 / Math.max(config.animationSpeed, 0.2)).toFixed(2)}s`;
  const overlayStyle: React.CSSProperties = (() => {
    if (config.backgroundType === 'image' && config.backgroundImageUrl) {
      return {
        backgroundImage: `linear-gradient(135deg, ${toRgba(config.backgroundColor, config.overlayOpacity)}, ${toRgba(config.backgroundColor, config.overlayOpacity)}), url(${config.backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backdropFilter: `blur(${config.blurPx}px)`,
      };
    }
    if (config.backgroundType === 'gradient') {
      return {
        backgroundImage: `linear-gradient(135deg, ${toRgba(config.gradientFrom || config.backgroundColor, config.overlayOpacity)}, ${toRgba(config.gradientTo || config.backgroundColor, config.overlayOpacity)})`,
        backdropFilter: `blur(${config.blurPx}px)`,
      };
    }
    return {
      backgroundColor: toRgba(config.backgroundColor, config.overlayOpacity),
      backdropFilter: `blur(${config.blurPx}px)`,
    };
  })();

  const containerStyle: React.CSSProperties = {
    color: config.textColor,
    ...parseCustomCss(config.customCss),
  };
  const logoUrl = resolveOptimizedStaticImageUrl(BRAND_PRELOADER_LOGO_URL);

  return (
    <>
      <style>
        {`
          @keyframes preloader-brand-pulse {
            0%, 100% { transform: scale(0.98); opacity: 0.9; }
            50% { transform: scale(1.02); opacity: 1; }
          }
        `}
      </style>
      <div
        className="fixed inset-0 z-[1200] flex w-full items-center justify-center p-6"
        style={overlayStyle}
      >
        <div
          className={`flex w-full max-w-lg flex-col items-center gap-4 text-center ${
            config.position === 'bottom' ? 'mt-auto pb-10' : ''
          }`}
          style={containerStyle}
        >
          <div
            className="flex h-28 w-28 items-center justify-center rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl"
            style={{ animation: `preloader-brand-pulse ${animationDuration} ease-in-out infinite` }}
          >
            <img
              src={logoUrl}
              alt="Scrolith preloader logo"
              width={80}
              height={80}
              decoding="async"
              className="h-20 w-20 object-contain"
              onError={(event) => {
                const target = event.currentTarget as HTMLImageElement;
                if (target.dataset.fallbackApplied === 'true') {
                  target.style.display = 'none';
                  return;
                }
                target.dataset.fallbackApplied = 'true';
                target.src = '/logo.png';
              }}
            />
          </div>
          {config.headlineText ? (
            <h3 className="text-lg font-semibold tracking-wide">{config.headlineText}</h3>
          ) : null}
          {config.subText ? <p className="max-w-md text-sm opacity-90">{config.subText}</p> : null}
        </div>
      </div>
    </>
  );
};

export default GlobalPreloader;
