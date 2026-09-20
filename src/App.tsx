import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
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

// Navigation & Icons
import { Map, Dumbbell, BarChart3, User } from 'lucide-react';
import type { CEFRLevel } from '@/types/models';

type AppScreen =
  | 'Welcome'
  | 'SignIn'
  | 'Subscription'
  | 'MainTabs'
  | 'ScenarioDetail'
  | 'Study'
  | 'Quiz'
  | 'LiveConversation'
  | 'SessionReport';

type NavigationTab = 'Trail' | 'Practice' | 'Progress' | 'Profile';

export function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('MainTabs');
  const [activeTab, setActiveTab] = useState<NavigationTab>('Trail');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('cafe_order');
  const [sessionSummary, setSessionSummary] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const user = useLiveQuery(() => db.users.get('current_user'));

  // Initialize database seed on first load and fetch latest scenarios from Cloudflare
  useEffect(() => {
    initializeDatabaseSeed().then(() => {
      workerClient.fetchScenarios();
      workerClient.fetchVocabulary();
      workerClient.fetchGrammar();
    });
  }, []);

  // Google sign in is essential: enforce authentication before accessing main tabs or learning sessions
  useEffect(() => {
    if (user !== undefined && !user.isLoggedIn) {
      if (currentScreen !== 'Welcome' && currentScreen !== 'SignIn') {
        const hasCompletedOnboarding = localStorage.getItem('katzu_onboarding_completed');
        setCurrentScreen(hasCompletedOnboarding ? 'SignIn' : 'Welcome');
      }
    }
  }, [user, currentScreen]);

  // Sign out handler
  const handleSignOut = async () => {
    await wipeUserScopedData();
    setAuthMode('signin');
    setCurrentScreen('SignIn');
  };

  return (
    <div className="min-h-screen bg-black text-text-primary flex flex-col justify-between">
      {/* Active Screen View */}
      <main className="flex-1 w-full">
        {currentScreen === 'Welcome' && (
          <WelcomeScreen
            onContinue={() => {
              setAuthMode('signup');
              setCurrentScreen('SignIn');
            }}
            onGoToSignIn={(mode?: 'signin' | 'signup') => {
              setAuthMode(mode || 'signin');
              setCurrentScreen('SignIn');
            }}
          />
        )}

        {currentScreen === 'SignIn' && (
          <SignInScreen
            initialMode={authMode}
            onBack={() => setCurrentScreen('Welcome')}
            onSuccess={() => {
              try {
                localStorage.setItem('katzu_onboarding_completed', 'true');
              } catch {}
              setCurrentScreen('MainTabs');
            }}
          />
        )}

        {currentScreen === 'Subscription' && (
          <SubscriptionRedemptionScreen
            onBack={() => setCurrentScreen('MainTabs')}
            onSuccess={() => setCurrentScreen('MainTabs')}
            onGoToSignIn={() => {
              setAuthMode('signin');
              setCurrentScreen('SignIn');
            }}
          />
        )}

        {currentScreen === 'ScenarioDetail' && (
          <ScenarioDetailScreen
            scenarioId={selectedScenarioId}
            onBack={() => setCurrentScreen('MainTabs')}
            onStartStudy={() => setCurrentScreen('Study')}
            onStartQuiz={() => setCurrentScreen('Quiz')}
            onStartConversation={() => setCurrentScreen('LiveConversation')}
            onOpenSubscription={() => setCurrentScreen('Subscription')}
          />
        )}

        {currentScreen === 'Study' && (
          <StudyScreen
            scenarioId={selectedScenarioId}
            onBack={() => setCurrentScreen('ScenarioDetail')}
            onProceedToQuiz={() => setCurrentScreen('Quiz')}
          />
        )}

        {currentScreen === 'Quiz' && (
          <QuizScreen
            scenarioId={selectedScenarioId}
            onBack={() => setCurrentScreen('ScenarioDetail')}
            onProceedToConversation={() => setCurrentScreen('LiveConversation')}
          />
        )}

        {currentScreen === 'LiveConversation' && (
          <LiveConversationScreen
            scenarioId={selectedScenarioId}
            onBack={() => setCurrentScreen('ScenarioDetail')}
            onCompleteSession={(summary) => {
              setSessionSummary(summary);
              setCurrentScreen('SessionReport');
            }}
          />
        )}

        {currentScreen === 'SessionReport' && sessionSummary && (
          <SessionReportScreen
            summary={sessionSummary}
            onReturnToTrail={() => setCurrentScreen('MainTabs')}
          />
        )}

        {currentScreen === 'MainTabs' && (
          <>
            {activeTab === 'Trail' && (
              <TrailScreen
                onSelectScenario={(id) => {
                  setSelectedScenarioId(id);
                  setCurrentScreen('ScenarioDetail');
                }}
                onOpenSubscription={() => setCurrentScreen('Subscription')}
              />
            )}

            {activeTab === 'Practice' && <PracticeScreen />}

            {activeTab === 'Progress' && <ProgressScreen />}

            {activeTab === 'Profile' && (
              <ProfileSettingsScreen
                onOpenSubscription={() => setCurrentScreen('Subscription')}
                onSignOut={handleSignOut}
                onGoToSignIn={() => {
                  setAuthMode('signin');
                  setCurrentScreen('SignIn');
                }}
              />
            )}

            {/* Bottom Navigation Bar */}
            <nav className="fixed bottom-0 start-0 end-0 bg-surface-card/95 backdrop-blur-xl border-t border-border-subtle p-2 max-w-md mx-auto z-40 flex items-center justify-around shadow-2xl">
              <button
                onClick={() => setActiveTab('Trail')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all ${
                  activeTab === 'Trail' ? 'text-primary font-bold scale-105' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Map className={`w-5 h-5 ${activeTab === 'Trail' ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[11px] font-arabic">المسار</span>
              </button>

              <button
                onClick={() => setActiveTab('Practice')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all ${
                  activeTab === 'Practice' ? 'text-primary font-bold scale-105' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Dumbbell className={`w-5 h-5 ${activeTab === 'Practice' ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[11px] font-arabic">التدريب</span>
              </button>

              <button
                onClick={() => setActiveTab('Progress')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all ${
                  activeTab === 'Progress' ? 'text-primary font-bold scale-105' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <BarChart3 className={`w-5 h-5 ${activeTab === 'Progress' ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[11px] font-arabic">التقدم</span>
              </button>

              <button
                onClick={() => setActiveTab('Profile')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all ${
                  activeTab === 'Profile' ? 'text-primary font-bold scale-105' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <User className={`w-5 h-5 ${activeTab === 'Profile' ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[11px] font-arabic">الملف</span>
              </button>
            </nav>
          </>
        )}
      </main>
    </div>
  );
}
export default App;
