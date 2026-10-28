import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { captureSourceFromSearch, readShareMarkerFromSearch } from '@/lib/attribution/source';
import { track } from '@/lib/analytics/client';
import { RouteFallback } from '@/components/common/RouteFallback';

/**
 * The entry. The marketing landing lives on its own site (website.katzuai.com),
 * so `/` goes straight into the app: the shell decides between the signed-in
 * app and the welcome/sign-in front door.
 *
 * A7 split the app shell out of this file. Before the split this module held the
 * whole router, which meant a stranger arriving at `/` paid for the signed-in
 * shell — the IndexedDB/Dexie seed, the review-engine cleanup and three content
 * fetches — before they saw the page they clicked on, behind a full-screen
 * "جاري التحقق من الحساب" gate. Measured: the entry chunk was 516 KB
 * (167 KB gzip), and the landing page could not paint until that work finished.
 *
 * Everything below `/` now lives in `src/app/AppShell.tsx`, loaded by the
 * dynamic import here. The route table, the gate, the seed and the redirect
 * rules are unchanged — only the moment they load is.
 *
 * What stays in the entry on purpose:
 *   - the two effects below: the channel tag and the share marker are captured
 *     for every route (a shared link can land on any path), so they must run
 *     from a component that is always mounted.
 *   - `titleForPath`: the tab title, pinned by `tests/screenNames.test.ts`.
 */
const AppShell = React.lazy(() =>
  import('@/app/AppShell').then((m) => ({ default: m.AppShell })),
);

export function App() {
  return (
    <BrowserRouter>
      <AppFrame />
    </BrowserRouter>
  );
}

/**
 * The frame both halves share: the tab title and the two "how did they get here"
 * effects. Outside the Suspense boundary so none of it waits on a chunk.
 */
function AppFrame() {
  const location = useLocation();

  // The channel tag is captured on EVERY route change, not once at boot: the
  // link that brought someone in is often a shared link or the signup link, and
  // a tag that only lives in the address bar is gone by the time they would pay.
  // Pure and total — an invalid or absent tag is simply not stored.
  useEffect(() => {
    captureSourceFromSearch(location.search);
  }, [location.search]);

  // The receiving half of `share_click`: this visit arrived on a link somebody
  // shared. Fired once per page load, on the first query string that carries a
  // code — a client-side route change re-runs this effect, and a learner who
  // navigates ten times must not become ten shares.
  useEffect(() => {
    const marker = readShareMarkerFromSearch(location.search);
    if (marker) track('share_landed', { kind: marker });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // V36: twenty-six screens all shipped the same `document.title`, so a learner
  // with four Katzu tabs open — or a screen reader announcing the page — could
  // never tell two of them apart. The title follows the route; the brand name
  // stays on the end of it.
  useEffect(() => {
    document.title = `${titleForPath(location.pathname)} · كَاتْزُو`;
  }, [location.pathname]);

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* `/` included: the welcome/sign-in front door, the whole signed-in app
            and every other route arrive with the shell chunk. */}
        <Route path="*" element={<AppShell />} />
      </Routes>
    </Suspense>
  );
}

/**
 * The name a route shows in the tab, the history entry and the screen reader's
 * page announcement. Order matters: the first match wins, so the specific
 * `/scenario/:id/...` patterns come before the bare `/scenario/:id` one.
 */
export function titleForPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/';
  const exact: Record<string, string> = {
    '/': 'تعلم الألمانية',
    '/welcome': 'ابدأ رحلتك',
    '/signin': 'تسجيل الدخول',
    '/onboarding': 'التهيئة',
    '/placement': 'اختبار المستوى',
    '/subscription': 'تفعيل الاشتراك',
    '/paywall': 'خيارات الاشتراك',
    '/mock': 'محاكاة B1',
    '/delete-account': 'طلب حذف الحساب',
    '/session-report': 'ملخص الجلسة',
    '/app/trail': 'المهمة اليومية',
    '/app/library': 'مكتبة المشاهد',
    '/app/practice': 'التدريب',
    '/app/grammar': 'القواعد',
    '/app/review': 'المراجعة',
    '/app/listen': 'الاستماع',
    '/app/write': 'الكتابة',
    '/app/coach': 'ملف أخطائك',
    '/app/ask': 'اسأل كَاتْزُو',
    '/app/progress': 'تقدمك',
    '/app/profile': 'بياناتك',
    '/partners': 'الشركاء',
  };
  if (exact[path]) return exact[path];
  if (/^\/scenario\/[^/]+\/story$/.test(path)) return 'الموقف';
  if (/^\/scenario\/[^/]+\/practice$/.test(path)) return 'تدريب موجّه';
  if (/^\/scenario\/[^/]+\/study$/.test(path)) return 'جلسة الدراسة';
  if (/^\/scenario\/[^/]+\/quiz$/.test(path)) return 'اختبار سريع';
  if (/^\/scenario\/[^/]+\/live$/.test(path)) return 'المحادثة الحية';
  if (/^\/scenario\/[^/]+$/.test(path)) return 'المشهد';
  if (/^\/app\//.test(path)) return 'كَاتْزُو';
  return 'كَاتْزُو';
}

export default App;
