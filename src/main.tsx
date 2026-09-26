import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { NetworkStatusBanner } from './components/common/NetworkStatusBanner';
import { installDiagnosticsCapture } from './lib/utils/diagnostics';
import { installPreloadRecovery } from './lib/utils/preloadRecovery';
import './index.css';

// Capture console.error/warn, window.onerror and unhandledrejection into the
// timestamped diagnostics buffer BEFORE any app code can fail.
installDiagnosticsCapture();

// A deploy swaps the route chunks out from under a running session. One guarded
// reload recovers it instead of leaving the learner on a dead route.
installPreloadRecovery();

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
