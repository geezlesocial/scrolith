import { useEffect, useState } from 'react';
import { CheckCircle2, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../context/NetworkStatusContext';

const OfflineBanner = () => {
  const { isOnline, isRecentlyReconnected, shouldAttemptLiveConnections } = useNetworkStatus();
  const [showRecoveredState, setShowRecoveredState] = useState(false);

  useEffect(() => {
    if (!isRecentlyReconnected || !isOnline) {
      setShowRecoveredState(false);
      return;
    }
    setShowRecoveredState(true);
    const timeout = window.setTimeout(() => {
      setShowRecoveredState(false);
    }, 3500);
    return () => window.clearTimeout(timeout);
  }, [isOnline, isRecentlyReconnected]);

  if (isOnline && !showRecoveredState) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`fixed bottom-4 left-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg ${
        isOnline
          ? 'bg-emerald-600 text-white'
          : 'bg-gray-900 text-white'
      }`}
    >
      {isOnline ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-100" aria-hidden="true" />
      ) : (
        <WifiOff className="h-4 w-4 text-yellow-300" aria-hidden="true" />
      )}
      <span className="text-sm font-medium">
        {isOnline
          ? `Back online. ${shouldAttemptLiveConnections ? 'Reconnecting live updates…' : 'Resuming the app…'}`
          : 'You are offline. Live updates and retries are paused until your connection returns.'}
      </span>
    </div>
  );
};

export default OfflineBanner;
