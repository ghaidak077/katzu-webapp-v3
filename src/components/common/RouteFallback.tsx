import React from 'react';

/**
 * Shown while a route's code is still downloading — never a blank screen.
 *
 * Lives on its own because two routers now render it: the entry (`src/App.tsx`,
 * which holds only the landing page) and the lazily-loaded app shell that the
 * entry pulls in for every other path. Importing it from either of those would
 * make the shell — which is loaded BY the entry — import the entry back, so the
 * one shared piece of markup gets its own module instead.
 */
export function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-live="polite">
      <span className="font-arabic text-sm text-text-secondary">جارٍ التحميل…</span>
    </div>
  );
}
