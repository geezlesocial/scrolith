import { useEffect, useMemo, useState } from 'react';
import { useContent } from '../context/ContentContext';
import {
  getPerformanceProfile,
  readUserDataSaverPreference,
  USER_DATA_SAVER_KEY,
  writeUserDataSaverPreference
} from '../utils/performanceProfile';

export const usePerformanceProfile = () => {
  const { settings } = useContent();
  const [userDataSaver, setUserDataSaver] = useState<boolean>(() => readUserDataSaverPreference());
  const [connectionVersion, setConnectionVersion] = useState(0);

  useEffect(() => {
    const nav = navigator as any;
    const connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
    if (!connection?.addEventListener || !connection?.removeEventListener) return undefined;
    const onChange = () => setConnectionVersion((prev) => prev + 1);
    connection.addEventListener('change', onChange);
    return () => connection.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== USER_DATA_SAVER_KEY) return;
      setUserDataSaver(readUserDataSaverPreference());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const optimization = useMemo(() => {
    const root = (settings as any) || {};
    const system = root?.system || root;
    return system?.optimization || {};
  }, [settings]);

  const profile = useMemo(
    () => getPerformanceProfile(optimization, { userDataSaver }),
    [optimization, userDataSaver, connectionVersion]
  );

  const updateUserDataSaver = (enabled: boolean) => {
    writeUserDataSaverPreference(enabled);
    setUserDataSaver(Boolean(enabled));
  };

  return {
    profile,
    userDataSaver,
    setUserDataSaver: updateUserDataSaver
  };
};

export default usePerformanceProfile;

