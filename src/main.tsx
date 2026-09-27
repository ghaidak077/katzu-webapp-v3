import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { NetworkStatusBanner } from './components/common/NetworkStatusBanner';
import { installDiagnosticsCapture } from './lib/utils/diagnostics';
import { installPreloadRecovery } from './lib/utils/preloadRecovery';
import { installAnalyticsLifecycle } from './lib/analytics/client';
import './index.css';

// Capture console.error/warn, window.onerror and unhandledrejection into the
// timestamped diagnostics buffer BEFORE any app code can fail.
installDiagnosticsCapture();

// A deploy swaps the route chunks out from under a running session. One guarded
// reload recovers it instead of leaving the learner on a dead route.
installPreloadRecovery();

// Flushes the queued product-analytics batch when connectivity returns and when
// the app is backgrounded. Best-effort by design; never blocks a screen.
installAnalyticsLifecycle();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <>
        <NetworkStatusBanner />
        <App />
      </>
    </ErrorBoundary>
  </React.StrictMode>
);
