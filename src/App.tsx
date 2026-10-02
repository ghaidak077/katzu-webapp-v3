import React, { Suspense, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { db, initializeDatabaseSeed, seedArrivalTopUps, wipeUserScopedData } from '@/lib/db/katzuDb';
import { suppressInvalidReviewItems } from '@/lib/srs/store';
import { applyRendererTier, useRendererTier } from '@/lib/design/rendererTier';
import { workerClient } from '@/lib/api/workerClient';
import { needsOnboarding } from '@/lib/onboarding/preferences';
import { isDevBuild } from '@/lib/utils/env';
import { DAILY_MINUTE_CHOICES, type DailyMinuteChoice } from '@/types/models';

// Screens the first paint needs are eager: a visitor must see the landing page
// (and then sign-in) without waiting on anything else.
import { WelcomeScreen } from '@/features/auth/WelcomeScreen';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { LandingScreen } from '@/features/marketing/LandingScreen';

/**
 * Everything behind sign-in loads on navigation, not before it.
 *
 * The built entry chunk was 619 KB / 183 KB gzipped — every screen, the review
 * engine and all the sheets inside one file that a phone had to download before
 * the landing page could paint (Vite warned about it on every build). These are
 * named exports, so `lazy` needs the explicit re-shape; the imports stay static
 * so a broken path fails the build rather than at runtime.
 */
const SubscriptionRedemptionScreen = React.lazy(() =>
  import('@/features/auth/SubscriptionRedemptionScreen').then((m) => ({ default: m.SubscriptionRedemptionScreen })),
);
const TrailScreen = React.lazy(() =>
  import('@/features/trail/TrailScreen').then((m) => ({ default: m.TrailScreen })),
);
const ScenarioDetailScreen = React.lazy(() =>
  import('@/features/study/ScenarioDetailScreen').then((m) => ({ default: m.ScenarioDetailScreen })),
);
const StudyScreen = React.lazy(() =>
  import('@/features/study/StudyScreen').then((m) => ({ default: m.StudyScreen })),
);
const QuizScreen = React.lazy(() =>
  import('@/features/quiz/QuizScreen').then((m) => ({ default: m.QuizScreen })),
);
const LiveConversationScreen = React.lazy(() =>
  import('@/features/conversation/LiveConversationScreen').then((m) => ({ default: m.LiveConversationScreen })),
);
const SessionReportScreen = React.lazy(() =>
  import('@/features/report/SessionReportScreen').then((m) => ({ default: m.SessionReportScreen })),
);
const PracticeScreen = React.lazy(() =>
  import('@/features/practice/PracticeScreen').then((m) => ({ default: m.PracticeScreen })),
);
const GrammarSectionScreen = React.lazy(() =>
  import('@/features/grammar/GrammarSectionScreen').then((m) => ({ default: m.GrammarSectionScreen })),
);
const ProgressScreen = React.lazy(() =>
  import('@/features/progress/ProgressScreen').then((m) => ({ default: m.ProgressScreen })),
);
const ProfileSettingsScreen = React.lazy(() =>
  import('@/features/settings/ProfileSettingsScreen').then((m) => ({ default: m.ProfileSettingsScreen })),
);
const ReviewScreen = React.lazy(() =>
  import('@/features/review/ReviewScreen').then((m) => ({ default: m.ReviewScreen })),
);
const PlacementScreen = React.lazy(() =>
  import('@/features/placement/PlacementScreen').then((m) => ({ default: m.PlacementScreen })),
);
const ListeningScreen = React.lazy(() =>
  import('@/features/listening/ListeningScreen').then((m) => ({ default: m.ListeningScreen })),
);
const WritingScreen = React.lazy(() =>
  import('@/features/writing/WritingScreen').then((m) => ({ default: m.WritingScreen })),
);
const CoachScreen = React.lazy(() =>
  import('@/features/coach/CoachScreen').then((m) => ({ default: m.CoachScreen })),
);
const AskKatzuScreen = React.lazy(() =>
  import('@/features/ask/AskKatzuScreen').then((m) => ({ default: m.AskKatzuScreen })),
);
const DemoScreen = React.lazy(() =>
  import('@/features/demo/DemoScreen').then((m) => ({ default: m.DemoScreen })),
);
const OnboardingScreen = React.lazy(() =>
  import('@/features/onboarding/OnboardingScreen').then((m) => ({ default: m.OnboardingScreen })),
);
// Katzu V2 screens (Journey Home → Story → Guided Practice → Live → Debrief).
const JourneyHomeScreen = React.lazy(() =>
  import('@/features/journey/JourneyHomeScreen').then((m) => ({ default: m.JourneyHomeScreen })),
);
const StorySetupScreen = React.lazy(() =>
  import('@/features/journey/StorySetupScreen').then((m) => ({ default: m.StorySetupScreen })),
);
const GuidedPracticeScreen = React.lazy(() =>
  import('@/features/journey/GuidedPracticeScreen').then((m) => ({ default: m.GuidedPracticeScreen })),
);
// Development-only design-system page; never registered in a production build.
// The privacy policy / terms pages are public but are not part of any first
// paint: a visitor reads them from the footer, not from the landing hero.
const TrustInfoScreen = React.lazy(() =>
  import('@/features/settings/TrustInfoScreen').then((m) => ({ default: m.TrustInfoScreen })),
);
// Development-only design-system page; never registered in a production build.
const DesignSystemScreen = isDevBuild
  ? React.lazy(() => import('@/features/dev/DesignSystemScreen').then((m) => ({ default: m.DesignSystemScreen })))
  : null;

// Navigation & Icons
import { Map, Dumbbell, BarChart3, User } from 'lucide-react';
import { GlassEffectContainer } from '@/components/glass/GlassEffectContainer';

type NavigationTab = 'Trail' | 'Practice' | 'Progress' | 'Profile';

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionSummary, setSessionSummary] = useState<any>(() => {
    try {
      const stored = sessionStorage.getItem('katzu_session_summary');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const user = useLiveQuery(() => db.users.get('current_user'));

  // B4c: resolve the renderer tier once and publish it as a root class, so the
  // glass material can drop blur/saturation/grain on constrained devices.
  const rendererTier = useRendererTier();
  useEffect(() => {
    applyRendererTier(rendererTier);
  }, [rendererTier]);

  // Initialize database seed on first load and fetch latest scenarios from Cloudflare
  useEffect(() => {
    let isMounted = true;

    initializeDatabaseSeed()
      .then(() => seedArrivalTopUps())
      // Hide any stored item that fails the answerability contract (V28 Stage 1B);
      // idempotent, and it never deletes learner data.
      .then(() => suppressInvalidReviewItems())
      .then(() => {
        if (!isMounted) return;
        workerClient.fetchScenarios();
        workerClient.fetchVocabulary();
        workerClient.fetchGrammar();
      })
      .catch((error) => {
        console.warn('Database initialization error:', error);
      })
      .finally(() => {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Google sign in is essential: enforce authentication before accessing main tabs or learning sessions
  useEffect(() => {
    if (!isAuthLoading && user !== undefined && !user.isLoggedIn && !isPublicPath(location.pathname)) {
      const hasCompletedOnboarding = localStorage.getItem('katzu_onboarding_completed');
      navigate(hasCompletedOnboarding ? '/signin' : '/welcome', { replace: true });
    }
  }, [user, location.pathname, isAuthLoading, navigate]);

  const isAuthResolved = !isAuthLoading && user !== undefined;
  const isAuthenticated = user?.isLoggedIn === true;

  if (!isAuthResolved) {
    return (
      <div
        className="min-h-screen bg-black text-text-primary flex items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <span className="font-arabic text-text-secondary">جاري التحقق من الحساب...</span>
      </div>
    );
  }

  // Sign out handler
  const handleSignOut = async () => {
    try { await workerClient.signOutSession(); } catch { /* best-effort */ }
    await wipeUserScopedData();
    navigate('/signin');
  };

  return (
    <div className="min-h-screen bg-black text-text-primary flex flex-col justify-between">
      {/* Active Screen View */}
      <main className="flex-1 w-full">
        {/* A lazily-loaded route shows this while its code arrives. Without a
            fallback React unmounts the tree and the learner sees a blank page. */}
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<LandingRoute />} />
            <Route
              path="/welcome"
              element={
                <WelcomeScreen
                  onGoToSignIn={(mode) => navigate(`/signin${mode === 'signup' ? '?mode=signup' : ''}`)}
                  onTryDemo={() => navigate('/demo')}
                />
              }
            />
            <Route path="/signin" element={<SignInRoute />} />
            {/* Public demo: one real learning turn before any account exists. */}
            <Route
              path="/demo"
              element={
                <DemoScreen
                  onHome={() => navigate('/')}
                  onSignUp={() => navigate('/signin?mode=signup')}
                  onStartPlacement={() => navigate('/signin?mode=signup&returnTo=%2Fplacement')}
                />
              }
            />
            <Route path="/onboarding" element={<OnboardingRoute />} />
            <Route path="/subscription" element={<SubscriptionRoute />} />
            <Route path="/placement" element={<PlacementRoute />} />
            {/* Katzu V2 episode: Journey Home → Story → Guided Practice → Live → Debrief.
                `/app/library` keeps the pre-V2 trail reachable for browsing every
                scenario and level; it is navigation, not the daily mission. */}
            <Route path="/app/library" element={<ScenarioLibraryRoute />} />
            <Route path="/scenario/:scenarioId/story" element={<StoryRoute />} />
            <Route path="/scenario/:scenarioId/practice" element={<GuidedPracticeRoute />} />
            {isDevBuild && DesignSystemScreen && (
              <Route path="/dev/system" element={<DesignSystemScreen />} />
            )}
            <Route path="/app/grammar" element={<GrammarRoute />} />
            <Route path="/app/review" element={<ReviewRoute />} />
            <Route path="/app/listen" element={<ListeningRoute />} />
            <Route path="/app/write" element={<WritingRoute />} />
            <Route path="/app/coach" element={<CoachRoute />} />
            <Route path="/app/ask" element={<AskRoute />} />
            <Route path="/app" element={<Navigate to="/app/trail" replace />} />
            <Route path="/app/:tab" element={<MainTabsRoute onSignOut={handleSignOut} />} />
            <Route path="/main" element={<Navigate to="/app/trail" replace />} />
            <Route path="/main/:tab" element={<MainTabsRoute onSignOut={handleSignOut} />} />
            <Route path="/scenario/:scenarioId" element={<ScenarioRoute />} />
            <Route path="/scenario/:scenarioId/study" element={<StudyRoute />} />
            <Route path="/scenario/:scenarioId/quiz" element={<QuizRoute />} />
            <Route path="/scenario/:scenarioId/live" element={<LiveRoute onComplete={(summary) => {
              setSessionSummary(summary);
              try {
                sessionStorage.setItem('katzu_session_summary', JSON.stringify(summary));
              } catch {}
              navigate('/session-report');
            }} />} />
            <Route path="/session-report" element={<ReportRoute summary={sessionSummary} onLoadSummary={setSessionSummary} />} />
            <Route path="/trust/:page" element={<TrustRoute />} />
            <Route path="*" element={<Navigate to={isAuthenticated ? '/app/trail' : '/'} replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );}

/** Shown while a route's code is still downloading — never a blank screen. */
function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-live="polite">
      <span className="font-arabic text-sm text-text-secondary">جارٍ التحميل…</span>
    </div>
  );
}

function isPublicPath(pathname: string) {
  // `/` is the public landing page, `/trust/*` holds the privacy policy and
  // terms — a visitor must be able to read those before creating an account —
  // and `/demo` is the value-before-signup lesson, which by definition cannot
  // require an account.
  return (
    pathname === '/' ||
    pathname === '/welcome' ||
    pathname === '/signin' ||
    pathname === '/demo' ||
    pathname.startsWith('/trust')
  );
}

function TrustRoute() {
  const navigate = useNavigate();
  const { page } = useParams();
  const user = useLiveQuery(() => db.users.get('current_user'));
  const selected =
    page === 'terms' || page === 'contact' || page === 'imprint' || page === 'refund'
      ? page
      : 'privacy';
  // These pages are public, so "back" must not send a signed-out visitor into a
  // protected route — that would bounce them straight to the sign-in screen.
  const backTo = user?.isLoggedIn ? '/app/profile' : '/';
  return <TrustInfoScreen page={selected} onBack={() => navigate(backTo)} />;
}

function LandingRoute() {
  const navigate = useNavigate();
  return (
    <LandingScreen
      onStart={() => navigate('/welcome')}
      onSignIn={() => navigate('/signin')}
      onContinue={() => navigate('/app/trail')}
      onOpenTrustPage={(page) => navigate(`/trust/${page}`)}
      onTryDemo={() => navigate('/demo')}
    />
  );
}

function SignInRoute() {
  const navigate = useNavigate();
  const mode = new URLSearchParams(useLocation().search).get('mode');
  return (
    <SignInScreen
      initialMode={mode === 'signup' ? 'signup' : 'signin'}
      onBack={() => navigate('/welcome')}
      onSuccess={async () => {
        try {
          localStorage.setItem('katzu_onboarding_completed', 'true');
        } catch {}
        // Anything the visitor practised in the public demo becomes real study
        // evidence here — the studied scenario and its review cards, and nothing
        // else (no unverifiable demo score).
        try {
          const { consumeDemoProgress } = await import('@/lib/demo/migration');
          await consumeDemoProgress();
        } catch {}

        const user = await db.users.get('current_user');
        // A new learner answers the four onboarding questions first; only then
        // does the placement check run, so the questions are never what blocks
        // the first lesson.
        if (needsOnboarding(user)) {
          navigate('/onboarding', { replace: true });
          return;
        }
        // A learner who has never been measured starts with the placement check,
        // so the Trail is built from their real level instead of a guess.
        const needsPlacement = !!user && !user.placementCompletedAt && !user.placementSkippedAt;
        navigate(needsPlacement ? '/placement' : '/app/trail', { replace: true });
      }}
    />
  );
}

function OnboardingRoute() {
  const navigate = useNavigate();
  const user = useLiveQuery(() => db.users.get('current_user'));
  const mode = new URLSearchParams(useLocation().search).get('mode') === 'edit' ? 'edit' : 'first_run';

  // Onboarding is a signed-in surface: a visitor who lands here directly is sent
  // to sign-in with the intent preserved by the template's usual path.
  // `undefined` means the read has not resolved yet (the shell above already
  // waited for the seed to write the row), never "signed out" — treating the two
  // the same bounced every learner who opened this route directly.
  if (user === undefined) return null;
  if (!user.isLoggedIn) return <Navigate to="/signin?mode=signup" replace />;

  return (
    <OnboardingScreen
      mode={mode}
      initial={{
        primaryGoal: user.primaryGoal ?? null,
        arrivalStatus: user.arrivalStatus ?? null,
        previousGerman: user.previousGerman ?? null,
        // Prefill only when the stored number is genuinely one of the offered
        // choices; an old value like 15 is shown as an unanswered question
        // rather than silently rounded to a guess.
        dailyMinutes: (DAILY_MINUTE_CHOICES as readonly number[]).includes(user.dailyGoalMinutes)
          ? (user.dailyGoalMinutes as DailyMinuteChoice)
          : null,
        targetDateKind: user.targetDateKind ?? null,
        targetDate: user.targetDate ?? null,
        weeklyGoalDays: user.weeklyGoalDays || 5,
      }}
      onBack={() => navigate(mode === 'edit' ? '/app/profile' : '/welcome')}
      onDone={(choice) => {
        if (mode === 'edit') {
          navigate('/app/profile', { replace: true });
          return;
        }
        navigate(choice === 'take' ? '/placement' : '/app/trail', { replace: true });
      }}
    />
  );
}

function SubscriptionRoute() {
  const navigate = useNavigate();
  return (
    <SubscriptionRedemptionScreen
      onBack={() => navigate('/app/trail')}
      onSuccess={() => navigate('/app/trail')}
      onGoToSignIn={() => navigate('/signin')}
    />
  );
}

function ReviewRoute() {
  const navigate = useNavigate();
  return <ReviewScreen onBack={() => navigate('/app/trail')} />;
}

function PlacementRoute() {
  const navigate = useNavigate();
  return <PlacementScreen onDone={() => navigate('/app/trail', { replace: true })} />;
}

function ListeningRoute() {
  const navigate = useNavigate();
  return <ListeningScreen onBack={() => navigate('/app/practice')} />;
}

function WritingRoute() {
  const navigate = useNavigate();
  return (
    <WritingScreen
      onBack={() => navigate('/app/practice')}
      onOpenSubscription={() => navigate('/subscription')}
    />
  );
}

function CoachRoute() {
  const navigate = useNavigate();
  return (
    <CoachScreen
      onBack={() => navigate('/app/practice')}
      onStartReview={() => navigate('/app/review')}
    />
  );
}

function AskRoute() {
  const navigate = useNavigate();
  return (
    <AskKatzuScreen
      onBack={() => navigate('/app/practice')}
      onOpenSubscription={() => navigate('/subscription')}
    />
  );
}

function GrammarRoute() {
  const navigate = useNavigate();
  return (
    <GrammarSectionScreen
      onBack={() => navigate('/app/trail')}
      onOpenScenario={(scenarioId) =>
        navigate(`/scenario/${encodeURIComponent(scenarioId)}/story`)
      }
    />
  );
}

function MainTabsRoute({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const navigate = useNavigate();
  const { tab = 'trail' } = useParams();
  const activeTab = toNavigationTab(tab);
  const setTab = (nextTab: NavigationTab) => navigate(`/app/${nextTab.toLowerCase()}`);

  return (
    <>
      {activeTab === 'Trail' && (
        <JourneyHomeScreen
          onStartMission={(scenarioId) =>
            navigate(`/scenario/${encodeURIComponent(scenarioId)}/story`)
          }
          onOpenReview={() => navigate('/app/review')}
          onOpenSubscription={() => navigate('/subscription')}
          onOpenLibrary={() => navigate('/app/library')}
          onOpenOnboarding={() => navigate('/onboarding?mode=edit')}
          onOpenGrammar={() => navigate('/app/grammar')}
        />
      )}
      {activeTab === 'Practice' && (
        <PracticeScreen
          onOpenListening={() => navigate('/app/listen')}
          onOpenWriting={() => navigate('/app/write')}
          onOpenCoach={() => navigate('/app/coach')}
          onOpenAsk={() => navigate('/app/ask')}
        />
      )}
      {activeTab === 'Progress' && (
        <ProgressScreen
          onOpenScenario={(scenarioId) =>
            navigate(`/scenario/${encodeURIComponent(scenarioId)}/study`)
          }
          onOpenReview={() => navigate('/app/review')}
        />
      )}
      {activeTab === 'Profile' && (
        <ProfileSettingsScreen
          onOpenSubscription={() => navigate('/subscription')}
          onSignOut={onSignOut}
          onGoToSignIn={() => navigate('/signin')}
          onOpenTrustPage={(page) => navigate(`/trust/${page}`)}
          onOpenPlacement={() => navigate('/placement')}
          onOpenPreferences={() => navigate('/onboarding?mode=edit')}
        />
      )}
      {/* Secondary destinations only: glass, muted, and never competing with the
          mission's single primary action.

          The four tabs sit inside one glass-effect container, so their surfaces
          blend where they meet and the active shape travels between them instead of
          cutting. That is the Liquid Glass container behaviour — shared backdrop, one
          identity morphing — rather than four independent panels in a row. */}
      <nav className="fixed bottom-0 start-0 end-0 z-40 mx-auto max-w-md px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <GlassEffectContainer
          spacing={10}
          activeKey={activeTab}
          className="kz-surface overflow-hidden flex items-center justify-around"
        >
          <TabButton glassKey="Trail" active={activeTab === 'Trail'} onClick={() => setTab('Trail')} icon={<Map />} label="الرحلة" />
          <TabButton glassKey="Practice" active={activeTab === 'Practice'} onClick={() => setTab('Practice')} icon={<Dumbbell />} label="التدريب" />
          <TabButton glassKey="Progress" active={activeTab === 'Progress'} onClick={() => setTab('Progress')} icon={<BarChart3 />} label="التقدم" />
          <TabButton glassKey="Profile" active={activeTab === 'Profile'} onClick={() => setTab('Profile')} icon={<User />} label="الملف" />
        </GlassEffectContainer>
      </nav>
    </>
  );
}

function TabButton({ glassKey, active, onClick, icon, label }: { glassKey?: string; active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    // V19: the active-tab highlight is the container's own concentric pill
    // (rendered by GlassEffectContainer from the activeBox); the button itself
    // paints nothing. One shape, not two — the pre-V19 double highlight was a
    // rounded-2xl tint over a 28px-radius container with no inset or clip, which
    // is exactly the corner/edge clash this run measured.
    <div data-glass-key={glassKey} className="flex-1">
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-[48px] w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 ${
          active ? 'text-kz-lavender' : 'text-kz-inkFaint'
        }`}
      >
        {React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
          className: `w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`,
        })
        }
        <span className="font-arabic text-[10px]">{label}</span>
      </button>
    </div>
  );
}

function toNavigationTab(tab: string): NavigationTab {
  const normalized = tab.toLowerCase();
  if (normalized === 'practice') return 'Practice';
  if (normalized === 'progress') return 'Progress';
  if (normalized === 'profile') return 'Profile';
  return 'Trail';
}

function StoryRoute() {
  const navigate = useNavigate();
  const { scenarioId = 'cafe_order' } = useParams();
  return (
    <StorySetupScreen
      scenarioId={scenarioId}
      onBack={() => navigate('/app/trail')}
      onStart={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}/practice`)}
    />
  );
}

function GuidedPracticeRoute() {
  const navigate = useNavigate();
  const { scenarioId = 'cafe_order' } = useParams();
  return (
    <GuidedPracticeScreen
      scenarioId={scenarioId}
      onBack={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}/story`)}
      onReady={(context) => navigate(`/scenario/${encodeURIComponent(scenarioId)}/live`, { state: { practiceContext: context } })}
      onDeepPractice={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}/study`)}
    />
  );
}

/** The pre-V2 trail, kept as the scenario/level library. */
function ScenarioLibraryRoute() {
  const navigate = useNavigate();
  return (
    <TrailScreen
      onSelectScenario={(id) => navigate(`/scenario/${encodeURIComponent(id)}/story`)}
      onOpenSubscription={() => navigate('/subscription')}
      onOpenReview={() => navigate('/app/review')}
      onOpenOnboarding={() => navigate('/onboarding?mode=edit')}
    />
  );
}

function ScenarioRoute() {
  const navigate = useNavigate();
  const { scenarioId = 'cafe_order' } = useParams();
  return (
    <ScenarioDetailScreen
      scenarioId={scenarioId}
      onBack={() => navigate('/app/trail')}
      onStartStudy={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}/study`)}
      onStartQuiz={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}/quiz`)}
      onStartConversation={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}/live`)}
    />
  );
}

function StudyRoute() {
  const navigate = useNavigate();
  const { scenarioId = 'cafe_order' } = useParams();
  return <StudyScreen scenarioId={scenarioId} onBack={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}`)} onProceedToQuiz={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}/quiz`)} />;
}

function QuizRoute() {
  const navigate = useNavigate();
  const { scenarioId = 'cafe_order' } = useParams();
  return <QuizScreen scenarioId={scenarioId} onBack={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}`)} onProceedToConversation={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}/live`)} />;
}

function LiveRoute({ onComplete }: { onComplete: (summary: any) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { scenarioId = 'cafe_order' } = useParams();
  const state = location.state as { practiceContext?: { vocabulary?: unknown; grammarId?: unknown } } | null;
  const practiceContext = state?.practiceContext;
  const vocabularyContext = Array.isArray(practiceContext?.vocabulary)
    ? practiceContext.vocabulary
        .filter((word): word is string => typeof word === 'string')
        .slice(0, 12)
        .map((word) => word.slice(0, 80))
    : [];
  const grammarId = typeof practiceContext?.grammarId === 'string' && /^[a-z0-9_]{1,80}$/i.test(practiceContext.grammarId)
    ? practiceContext.grammarId
    : undefined;
  return <LiveConversationScreen scenarioId={scenarioId} vocabularyContext={vocabularyContext} grammarId={grammarId} onBack={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}`)} onOpenSubscription={() => navigate('/subscription')} onCompleteSession={onComplete} />;
}

function ReportRoute({ summary, onLoadSummary }: { summary: any; onLoadSummary: (summary: any) => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!summary) {
      try {
        const stored = sessionStorage.getItem('katzu_session_summary');
        if (stored) onLoadSummary(JSON.parse(stored));
      } catch {}
    }
  }, [summary, onLoadSummary]);
  if (!summary) return <Navigate to="/app/trail" replace />;
  return (
    <SessionReportScreen
      summary={summary}
      onReturnToTrail={() => navigate('/app/trail')}
      onOpenReview={() => navigate('/app/review')}
      onOpenSubscription={() => navigate('/subscription')}
    />
  );
}

export default App;
