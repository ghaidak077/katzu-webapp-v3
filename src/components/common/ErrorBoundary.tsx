import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        dir="rtl"
        className="min-h-screen bg-black text-text-primary flex items-center justify-center p-6"
      >
        <section className="max-w-sm text-center space-y-4">
          <h1 className="text-xl font-bold font-arabic">حدث خطأ غير متوقع</h1>
          <p className="text-sm text-text-secondary font-arabic">
            لم نتمكن من تحميل هذه الصفحة. أعد المحاولة، وستبقى بياناتك المحلية محفوظة.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white"
          >
            إعادة تحميل التطبيق
          </button>
        </section>
      </main>
    );
  }
}
