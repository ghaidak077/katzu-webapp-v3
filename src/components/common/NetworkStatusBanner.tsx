import React, { useEffect, useState } from 'react';

export const NetworkStatusBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };
    const handleOnline = () => setIsOnline(true);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (isOnline && !wasOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[70] px-4 py-2 text-center text-xs font-semibold font-arabic ${
        isOnline
          ? 'bg-status-success text-black'
          : 'bg-status-learning text-black'
      }`}
    >
      {isOnline
        ? 'عاد الاتصال. ستتم مزامنة تقدمك تلقائياً.'
        : 'أنت غير متصل. يمكنك متابعة الدراسة والمراجعة، أما المحادثة الذكية فتحتاج إلى الإنترنت.'}
    </div>
  );
};
