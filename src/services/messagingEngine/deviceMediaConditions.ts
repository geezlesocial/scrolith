/**
 * Device/network conditions for adaptive media behavior.
 */

export type DeviceMediaConditions = {
  online: boolean;
  saveData: boolean;
  metered: boolean;
  effectiveType: string;
  downlinkMbps: number;
  lowBattery: boolean;
  lowMemory: boolean;
  reducedMotion: boolean;
  allowPreload: boolean;
  allowBackgroundDownload: boolean;
};

export const getDeviceMediaConditions = (): DeviceMediaConditions => {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  const connection =
    typeof navigator !== 'undefined'
      ? ((navigator as any).connection ||
          (navigator as any).mozConnection ||
          (navigator as any).webkitConnection)
      : null;

  const saveData = Boolean(connection?.saveData);
  const effectiveType = String(connection?.effectiveType || '4g').toLowerCase();
  const downlinkMbps = Number(connection?.downlink || 10) || 10;
  // NetworkInformation.metered is not always present; treat 2g/3g as metered-ish.
  const metered = Boolean(connection?.metered) || effectiveType === '2g' || effectiveType === 'slow-2g';

  let lowBattery = false;
  // Battery API is async; use cached heuristic if present.
  try {
    const cached = (getDeviceMediaConditions as any)._battery;
    if (cached && typeof cached.level === 'number') {
      lowBattery = cached.level < 0.15 && !cached.charging;
    }
  } catch {
    // ignore
  }

  let lowMemory = false;
  try {
    const deviceMemory = Number((navigator as any)?.deviceMemory || 0);
    if (deviceMemory > 0 && deviceMemory <= 2) lowMemory = true;
  } catch {
    // ignore
  }

  let reducedMotion = false;
  try {
    reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    reducedMotion = false;
  }

  const allowPreload =
    online && !saveData && !lowMemory && effectiveType !== 'slow-2g' && effectiveType !== '2g';
  const allowBackgroundDownload = allowPreload && !lowBattery && !metered;

  return {
    online,
    saveData,
    metered,
    effectiveType,
    downlinkMbps,
    lowBattery,
    lowMemory,
    reducedMotion,
    allowPreload,
    allowBackgroundDownload
  };
};

// Best-effort battery cache
if (typeof navigator !== 'undefined' && typeof (navigator as any).getBattery === 'function') {
  void (navigator as any)
    .getBattery()
    .then((battery: any) => {
      (getDeviceMediaConditions as any)._battery = {
        level: battery.level,
        charging: battery.charging
      };
      battery.addEventListener?.('levelchange', () => {
        (getDeviceMediaConditions as any)._battery = {
          level: battery.level,
          charging: battery.charging
        };
      });
      battery.addEventListener?.('chargingchange', () => {
        (getDeviceMediaConditions as any)._battery = {
          level: battery.level,
          charging: battery.charging
        };
      });
    })
    .catch(() => undefined);
}
