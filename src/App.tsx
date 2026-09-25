import React, { useState, useEffect } from 'react';
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
import { db, initializeDatabaseSeed, wipeUserScopedData } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';

// Screens
import { WelcomeScreen } from '@/features/auth/WelcomeScreen';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { SubscriptionRedemptionScreen } from '@/features/auth/SubscriptionRedemptionScreen';
import { TrailScreen } from '@/features/trail/TrailScreen';
import { ScenarioDetailScreen } from '@/features/study/ScenarioDetailScreen';
import { StudyScreen } from '@/features/study/StudyScreen';
import { QuizScreen } from '@/features/quiz/QuizScreen';
import { LiveConversationScreen } from '@/features/conversation/LiveConversationScreen';
import { SessionReportScreen } from '@/features/report/SessionReportScreen';
import { PracticeScreen } from '@/features/practice/PracticeScreen';
import { ProgressScreen } from '@/features/progress/ProgressScreen';
import { ProfileSettingsScreen } from '@/features/settings/ProfileSettingsScreen';
import { TrustInfoScreen } from '@/features/settings/TrustInfoScreen';
import { ReviewScreen } from '@/features/review/ReviewScreen';
import { PlacementScreen } from '@/features/placement/PlacementScreen';
import { ListeningScreen } from '@/features/listening/ListeningScreen';
import { CoachScreen } from '@/features/coach/CoachScreen';

// Navigation & Icons
import { Map, Dumbbell, BarChart3, User } from 'lucide-react';

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

  // Initialize database seed on first load and fetch latest scenarios from Cloudflare
  useEffect(() => {
    let isMounted = true;

    initializeDatabaseSeed()
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
        <Routes>
          <Route path="/" element={<Navigate to="/app/trail" replace />} />
          <Route path="/welcome" element={<WelcomeScreen onContinue={() => navigate('/signin?mode=signup')} onGoToSignIn={(mode) => navigate(`/signin${mode === 'signup' ? '?mode=signup' : ''}`)} />} />
          <Route path="/signin" element={<SignInRoute />} />
          <Route path="/subscription" element={<SubscriptionRoute />} />
          <Route path="/placement" element={<PlacementRoute />} />
          <Route path="/app/review" element={<ReviewRoute />} />
          <Route path="/app/listen" element={<ListeningRoute />} />
          <Route path="/app/coach" element={<CoachRoute />} />
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
          <Route path="*" element={<Navigate to={isAuthenticated ? '/app/trail' : '/welcome'} replace />} />
        </Routes>
      </main>
    </div>
  );
}

function isPublicPath(pathname: string) {
  return pathname === '/welcome' || pathname === '/signin';
}

function TrustRoute() {
  const navigate = useNavigate();
  const { page } = useParams();
  const selected = page === 'terms' || page === 'contact' ? page : 'privacy';
  return <TrustInfoScreen page={selected} onBack={() => navigate('/app/profile')} />;
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
        // A learner who has never been measured starts with the placement check,
        // so the Trail is built from their real level instead of a guess.
        const user = await db.users.get('current_user');
        const needsPlacement = !!user && !user.placementCompletedAt && !user.placementSkippedAt;
        navigate(needsPlacement ? '/placement' : '/app/trail', { replace: true });
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

function CoachRoute() {
  const navigate = useNavigate();
  return (
    <CoachScreen
      onBack={() => navigate('/app/practice')}
      onStartReview={() => navigate('/app/review')}
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
      {activeTab === 'Trail' && <TrailScreen onSelectScenario={(id) => navigate(`/scenario/${encodeURIComponent(id)}`)} onOpenSubscription={() => navigate('/subscription')} onOpenReview={() => navigate('/app/review')} />}
      {activeTab === 'Practice' && (
        <PracticeScreen
          onOpenListening={() => navigate('/app/listen')}
          onOpenCoach={() => navigate('/app/coach')}
        />
      )}
      {activeTab === 'Progress' && <ProgressScreen />}
      {activeTab === 'Profile' && (
        <ProfileSettingsScreen
          onOpenSubscription={() => navigate('/subscription')}
          onSignOut={onSignOut}
          onGoToSignIn={() => navigate('/signin')}
          onOpenTrustPage={(page) => navigate(`/trust/${page}`)}
          onOpenPlacement={() => navigate('/placement')}
        />
      )}
      <nav className="fixed bottom-0 start-0 end-0 bg-surface-card/95 backdrop-blur-xl border-t border-border-subtle p-2 max-w-md mx-auto z-40 flex items-center justify-around shadow-2xl">
        <TabButton active={activeTab === 'Trail'} onClick={() => setTab('Trail')} icon={<Map />} label="المسار" />
        <TabButton active={activeTab === 'Practice'} onClick={() => setTab('Practice')} icon={<Dumbbell />} label="التدريب" />
        <TabButton active={activeTab === 'Progress'} onClick={() => setTab('Progress')} icon={<BarChart3 />} label="التقدم" />
        <TabButton active={activeTab === 'Profile'} onClick={() => setTab('Profile')} icon={<User />} label="الملف" />
      </nav>
    </>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all ${active ? 'text-primary font-bold scale-105' : 'text-text-secondary hover:text-text-primary'}`}>
      {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: `w-5 h-5 ${active ? 'stroke-[2.5]' : ''}` })}
      <span className="text-[11px] font-arabic">{label}</span>
    </button>
  );
}

function toNavigationTab(tab: string): NavigationTab {
  const normalized = tab.toLowerCase();
  if (normalized === 'practice') return 'Practice';
  if (normalized === 'progress') return 'Progress';
  if (normalized === 'profile') return 'Profile';
  return 'Trail';
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
      onOpenSubscription={() => navigate('/subscription')}
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
  const { scenarioId = 'cafe_order' } = useParams();
  return <LiveConversationScreen scenarioId={scenarioId} onBack={() => navigate(`/scenario/${encodeURIComponent(scenarioId)}`)} onOpenSubscription={() => navigate('/subscription')} onCompleteSession={onComplete} />;
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
  return <SessionReportScreen summary={summary} onReturnToTrail={() => navigate('/app/trail')} />;
}

export default App;
