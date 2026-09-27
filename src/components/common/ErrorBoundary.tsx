import React from 'react';
import { logError } from '@/lib/utils/diagnostics';
import { track } from '@/lib/analytics/client';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  reference: string;
}

/**
 * App version, in the same shape the diagnostics/analytics envelopes use, so a
 * report can be tied to the bundle that produced it.
 */
function appVersion(): string {
  try {
    return String((import.meta as any).env?.VITE_APP_VERSION || 'dev').slice(0, 32);
  } catch {
    return 'dev';
  }
}

/**
 * The one thing a crash report may contain: a route, an app version, an error's
 * own name and message, a timestamp and the online state. Never an
 * Authorization header, a session token, an API key, a transcript or a request
 * body — a crash must not become the place a learner's German sentences or
 * credentials leave the device.
 */
export function buildCrashContext(error: unknown, route: string) {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  return {
    route: route || '/',
    appVersion: appVersion(),
    errorName: name.slice(0, 60),
    // The message is a defect description, never learner content; it is still
    // truncated because some engines append source snippets to it.
    errorMessage: message.replace(/\s+/g, ' ').slice(0, 200),
    at: Date.now(),
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  };
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, reference: '' };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return {
      hasError: true,
      reference: `KZ-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    };
  }

  componentDidCatch(error: unknown) {
    const route = typeof location !== 'undefined' ? location.pathname : '/';
    const context = buildCrashContext(error, route);
    // Same ring buffer the diagnostics export reads; ERROR entries are also
    // forwarded to /client-error, which is where a crash is actually visible.
    logError('boundary', `${context.errorName}: ${context.errorMessage}`, `route=${context.route} version=${context.appVersion} online=${context.online}`);
    track('app_error', { reason: context.errorName, source: context.route, kind: 'render' });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        dir="rtl"
        role="alert"
        className="min-h-screen bg-black text-text-primary flex items-center justify-center p-6"
      >
        <section className="max-w-sm text-center space-y-4">
          <h1 className="text-xl font-bold font-arabic">حدث خطأ غير متوقع</h1>
          <p className="text-sm text-text-secondary font-arabic">
            لم نتمكن من تحميل هذه الصفحة. أعد المحاولة، وستبقى بياناتك المحفوظة على هذا الجهاز سليمة.
          </p>
          <button
            type="button"
            onClick={() => {
              // A fresh bundle is the fix for the common cause (a route chunk
              // replaced by a deploy), so go back inside the app rather than
              // only re-rendering the same failed tree.
              window.location.assign('/');
            }}
            className="w-full min-h-[44px] rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white"
          >
            إعادة تحميل التطبيق
          </button>
          <p className="text-[11px] text-text-muted font-arabic">
            يمكنك أيضاً العودة للصفحة الرئيسية. لن نرسل محتوى محادثاتك أو كلماتك في أي تقرير خطأ.
          </p>
        </section>
      </main>
    );
  }
}
