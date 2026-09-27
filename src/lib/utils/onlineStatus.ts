import { useEffect, useState } from 'react';

/**
 * Browser connectivity, as one shared hook.
 *
 * NetworkStatusBanner and the V2 screens both need this, and a second copy of
 * the listener logic would eventually disagree with the first about whether the
 * learner is online — the one state where a wrong answer changes what the UI
 * promises them.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOffline = () => setIsOnline(false);
    const handleOnline = () => setIsOnline(true);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return isOnline;
}
