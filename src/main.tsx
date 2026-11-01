import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { NetworkStatusBanner } from './components/common/NetworkStatusBanner';
import { UpdatePrompt } from './components/common/UpdatePrompt';
import { installDiagnosticsCapture } from './lib/utils/diagnostics';
import { installPreloadRecovery } from './lib/utils/preloadRecovery';
import { installAnalyticsLifecycle } from './lib/analytics/client';
import { trackAiReferralLanding } from './lib/analytics/referrer';
import { trackRetentionReturns } from './lib/analytics/retention';
import { captureAffiliateRefFromSearch } from './lib/attribution/source';
import { installUpdatePrompt } from './lib/pwa/updatePrompt';
import './index.css';

// Capture console.error/warn, window.onerror and unhandledrejection into the
// timestamped diagnostics buffer BEFORE any app code can fail.
installDiagnosticsCapture();

// Register the worker in prompt mode. A deploy installs a new bundle but does
// not reload the page; the learner sees one bar and updates when they are ready.
installUpdatePrompt();

// A partner link can land directly on the app (`katzuai.com/?ref=CODE`), not only
// on the marketing site. Read it once at boot, on the same 30-day cookie the site
// uses, so signup can attach it server-side.
captureAffiliateRefFromSearch(window.location.search);

// A deploy swaps the route chunks out from under a running session. One guarded
// reload recovers it instead of leaving the learner on a dead route.
installPreloadRecovery();

// Flushes the queued product-analytics batch when connectivity returns and when
// the app is backgrounded. Best-effort by design; never blocks a screen.
installAnalyticsLifecycle();

// GEO measurement: if this visit was opened from a ChatGPT / Perplexity / Gemini /
// Copilot / Claude answer, count it once with the existing `landing_viewed`
// event. Hostname only, no storage, nothing stored on the device.
trackAiReferralLanding();

// V24 Phase 7: day-1 / day-7 return markers — anonymous, allow-listed, one-shot
// per marker. Also seeds the first-seen anchor on a brand-new install.
trackRetentionReturns();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <>
        <NetworkStatusBanner />
        <UpdatePrompt />
        <App />
      </>
    </ErrorBoundary>
  </React.StrictMode>
);
