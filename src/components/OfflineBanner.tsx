import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

const OfflineBanner = () => {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 rounded-xl bg-gray-900 text-white px-4 py-3 shadow-lg flex items-center gap-2">
      <WifiOff className="w-4 h-4 text-yellow-300" />
      <span className="text-sm font-medium">You are offline. Some features may be unavailable.</span>
    </div>
  );
};

export default OfflineBanner;
