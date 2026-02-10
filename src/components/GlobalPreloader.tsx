import React from 'react';
import { usePreloader } from '../context/PreloaderContext';

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
  const overlayStyle: React.CSSProperties =
    config.backgroundType === 'gradient'
      ? {
          backgroundImage: `linear-gradient(135deg, ${toRgba(config.gradientFrom || config.backgroundColor, config.overlayOpacity)}, ${toRgba(config.gradientTo || config.backgroundColor, config.overlayOpacity)})`,
          backdropFilter: `blur(${config.blurPx}px)`,
        }
      : {
          backgroundColor: toRgba(config.backgroundColor, config.overlayOpacity),
          backdropFilter: `blur(${config.blurPx}px)`,
        };

  const containerStyle: React.CSSProperties = {
    color: config.textColor,
    ...parseCustomCss(config.customCss),
  };

  const renderLoader = () => {
    switch (config.loaderType) {
      case 'progress':
        return (
          <div className="w-64 max-w-full">
            <div className="h-2 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full w-1/3 rounded-full"
                style={{
                  backgroundColor: config.accentColor,
                  animation: `preloader-progress ${animationDuration} linear infinite`,
                }}
              />
            </div>
          </div>
        );
      case 'logoPulse':
        if (config.logoUrl) {
          return (
            <img
              src={config.logoUrl}
              alt="Loading logo"
              className="h-16 w-16 rounded-xl object-cover"
              style={{ animation: `preloader-pulse ${animationDuration} ease-in-out infinite` }}
            />
          );
        }
        return (
          <div
            className="h-12 w-12 rounded-full border-2"
            style={{
              borderColor: `${config.accentColor}55`,
              borderTopColor: config.accentColor,
              animation: `preloader-spin ${animationDuration} linear infinite`,
            }}
          />
        );
      case 'dots':
        return (
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="h-3 w-3 rounded-full"
                style={{
                  backgroundColor: config.accentColor,
                  animation: `preloader-bounce ${animationDuration} ease-in-out infinite`,
                  animationDelay: `${dot * 0.15}s`,
                }}
              />
            ))}
          </div>
        );
      case 'skeleton':
        return (
          <div className="w-64 max-w-full space-y-2">
            {[0, 1, 2].map((line) => (
              <div
                key={line}
                className="h-3 overflow-hidden rounded-full bg-white/20"
                style={{
                  width: line === 1 ? '80%' : '100%',
                }}
              >
                <div
                  className="h-full w-1/2"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${config.accentColor}, transparent)`,
                    animation: `preloader-progress ${animationDuration} linear infinite`,
                  }}
                />
              </div>
            ))}
          </div>
        );
      case 'lottie':
        if (config.logoUrl) {
          return (
            <img
              src={config.logoUrl}
              alt="Loading media"
              className="h-16 w-16 rounded-xl object-cover"
              style={{ animation: `preloader-spin ${animationDuration} linear infinite` }}
            />
          );
        }
        return (
          <div
            className="h-12 w-12 rounded-full border-2"
            style={{
              borderColor: `${config.accentColor}55`,
              borderTopColor: config.accentColor,
              animation: `preloader-spin ${animationDuration} linear infinite`,
            }}
          />
        );
      case 'spinner':
      default:
        return (
          <div
            className="h-12 w-12 rounded-full border-2"
            style={{
              borderColor: `${config.accentColor}55`,
              borderTopColor: config.accentColor,
              animation: `preloader-spin ${animationDuration} linear infinite`,
            }}
          />
        );
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes preloader-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes preloader-progress {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
          }
          @keyframes preloader-bounce {
            0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
          }
          @keyframes preloader-pulse {
            0%, 100% { transform: scale(0.95); opacity: 0.85; }
            50% { transform: scale(1.05); opacity: 1; }
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
          {renderLoader()}
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
