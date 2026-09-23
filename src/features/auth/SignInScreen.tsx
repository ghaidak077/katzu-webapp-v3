import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { db } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';
import { triggerHaptic } from '@/lib/utils/haptics';
import {
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Settings,
  Lock,
} from 'lucide-react';
import type { CEFRLevel } from '@/types/models';

export interface SignInScreenProps {
  initialMode?: 'signin' | 'signup';
  onBack: () => void;
  onSuccess: () => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

export const SignInScreen: React.FC<SignInScreenProps> = ({
  initialMode = 'signin',
  onBack,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  const currentUser = useLiveQuery(() => db.users.get('current_user'));
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel>('A1');

  useEffect(() => {
    if (currentUser?.cefrLevel) {
      setSelectedLevel(currentUser.cefrLevel);
    }
  }, [currentUser]);

  const googleClientId: string | undefined = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;

  // Initialize Google Identity Services if client ID is configured
  useEffect(() => {
    if (!googleClientId) return;

    let isMounted = true;
    const scriptId = 'google-gsi-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const setupGsi = () => {
      if (!window.google?.accounts?.id) return;
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
        });

        if (googleBtnContainerRef.current) {
          googleBtnContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            width: 280,
            text: mode === 'signup' ? 'signup_with' : 'signin_with',
            locale: 'ar',
          });
        }
      } catch (err) {
        console.warn('GIS initialization error:', err);
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (isMounted) setupGsi();
      };
      document.body.appendChild(script);
    } else {
      setupGsi();
    }

    return () => {
      isMounted = false;
    };
  }, [googleClientId, mode]);

  // Decode JWT payload helper
  const decodeJwt = (token: string) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  const completeUserAuth = async (
    userEmail: string,
    userDisplayName: string,
    idToken: string,
    level: CEFRLevel = 'A1'
  ) => {
    const cleanEmail = userEmail.trim().toLowerCase();
    const cleanName = userDisplayName.trim() || cleanEmail.split('@')[0] || 'طالب كَاتْزُو';

    // Exchange Google ID token for worker session JWT
    let sessionToken: string | undefined = undefined;
    try {
      const sessionResult = await workerClient.exchangeGoogleToken(idToken);
      if (sessionResult?.session_token) {
        sessionToken = sessionResult.session_token;
      }
    } catch (sessionErr) {
      console.warn('Could not exchange token with worker session endpoint:', sessionErr);
    }

    await db.users.update('current_user', {
      email: cleanEmail,
      googleAccountEmail: cleanEmail,
      displayName: cleanName,
      idToken,
      sessionToken,
      isLoggedIn: true,
      cefrLevel: level,
      updatedAt: Date.now(),
    });

    // Synchronize cloud subscription status and restore progress
    const activeAuthToken = sessionToken || idToken;
    try {
      const status = await workerClient.checkSubscriptionStatus(activeAuthToken);
      if (status.active) {
        await db.users.update('current_user', {
          isSubscriptionActive: true,
          subscriptionExpiresAt: status.expiresAt || null,
        });
      } else {
        // Server says inactive (expired/revoked): clear the stale local flag
        // so the downgrade takes effect immediately, not on next server check.
        await db.users.update('current_user', {
          isSubscriptionActive: false,
          subscriptionExpiresAt: null,
        });
      }
    } catch (err) {
      console.warn('Subscription check error on login:', err);
    }

    try {
      await workerClient.restoreProgress(activeAuthToken);
    } catch (err) {
      console.warn('Progress restore error on login:', err);
    }

    triggerHaptic('success');
    setSuccessMessage(
      mode === 'signup'
        ? 'تم إنشاء حسابك بنجاح! جاري الدخول...'
        : 'تم تسجيل الدخول بنجاح! مرحباً بعودتك...'
    );
    setTimeout(() => {
      onSuccess();
    }, 600);
  };

  const handleGoogleCredentialResponse = async (response: any) => {
    const idToken = response?.credential;
    if (!idToken) {
      setErrorMessage('تعذر استلام بيانات الاعتماد من Google.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      const payload = decodeJwt(idToken) || {};
      const userEmail = payload.email;
      if (!userEmail) {
        throw new Error('Missing email in Google ID token');
      }
      const userName = payload.name || payload.given_name || 'مستخدم كَاتْزُو';

      await completeUserAuth(userEmail, userName, idToken, selectedLevel);
    } catch (e: any) {
      setErrorMessage('فشل التحقق من تسجيل الدخول عبر Google، يرجى المحاولة ثانية.');
      triggerHaptic('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTriggerGooglePrompt = () => {
    triggerHaptic('light');
    setErrorMessage('');
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
  };

  // If VITE_GOOGLE_CLIENT_ID is missing, render configuration error screen
  if (!googleClientId) {
    return (
      <div className="min-h-screen flex flex-col justify-between p-6 bg-black text-text-primary max-w-md mx-auto relative font-arabic">
        <div>
          <button
            onClick={onBack}
            className="p-2.5 rounded-2xl bg-surface-card border border-border-subtle hover:bg-surface-subtle transition-colors mb-6"
          >
            <ArrowRight className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="flex flex-col items-center text-center my-auto px-2 space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-status-error/15 border border-status-error/30 text-status-error flex items-center justify-center mb-2">
            <Lock className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-text-primary">
            إعداد Google Sign-In مطلوب
          </h2>

          <p className="text-xs text-text-secondary leading-relaxed max-w-sm">
            لضمان أمان حسابات المتعلمين ومزامنة التقدم السحابي، يتطلب Katzu استخدام مصادقة Google Identity Services.
          </p>

          <div className="w-full p-4 rounded-2xl bg-surface-card border border-border-subtle text-start text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-text-primary">
              <Settings className="w-4 h-4 text-primary" />
              <span>خطوة مطلوبة من مسؤول التطبيق:</span>
            </div>
            <p className="text-text-muted leading-relaxed">
              يرجى ضبط متغير البيئة التالي في ملف <code className="text-primary font-mono">.env</code> أو لوحة Cloudflare Pages:
            </p>
            <div className="p-2.5 bg-black rounded-xl font-mono text-[11px] text-accent-light border border-border-subtle break-all">
              VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
            </div>
          </div>

          <Button
            size="md"
            variant="primary"
            className="w-full mt-4"
            onClick={() => completeUserAuth('guest@katzu.app', currentUser?.displayName || 'مستكشف كَاتْزُو', 'preview_guest_token', selectedLevel)}
          >
            المتابعة كضيف للمعاينة التجريبية
          </Button>

          <Button
            size="md"
            variant="secondary"
            className="w-full mt-2"
            onClick={onBack}
          >
            العودة للرئيسية
          </Button>
        </div>

        <div className="text-center text-xs text-text-muted pt-4 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span>نظام المصادقة الآمن عبر Google Identity Services</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-between p-6 bg-black text-text-primary max-w-md mx-auto relative overflow-y-auto font-arabic">
      {/* Top Bar */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="p-2.5 rounded-2xl bg-surface-card border border-border-subtle hover:bg-surface-subtle transition-colors"
          >
            <ArrowRight className="w-5 h-5 text-text-secondary" />
          </button>
          <span className="font-bold text-sm text-text-secondary">
            {mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
          </span>
          <div className="w-10" />
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1 bg-surface-card border border-border-subtle rounded-2xl mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setErrorMessage('');
              triggerHaptic('light');
            }}
            className={`py-2 rounded-xl text-xs font-bold transition-all ${
              mode === 'signin'
                ? 'bg-primary text-white shadow-glow-purple'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setErrorMessage('');
              triggerHaptic('light');
            }}
            className={`py-2 rounded-xl text-xs font-bold transition-all ${
              mode === 'signup'
                ? 'bg-primary text-white shadow-glow-purple'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            إنشاء حساب جديد
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center text-center my-auto px-1">
        <KatzuMascot
          name={mode === 'signin' ? 'avatar' : 'welcome'}
          glow
          className="w-24 h-24 mb-3 object-contain"
        />

        <h2 className="text-2xl font-bold mb-1.5 text-text-primary">
          {mode === 'signin' ? 'مرحباً بك مجدداً في كَاتْزُو' : 'انضم إلى عائلة كَاتْزُو'}
        </h2>
        <p className="text-xs text-text-secondary leading-relaxed mb-5 max-w-xs">
          {mode === 'signin'
            ? 'سجل دخولك بحساب Google لمزامنة تقدمك السحابي واشتراكك وبنك أخطائك بأمان.'
            : 'سجل بحساب Google لحفظ كل محادثة، كلمة جديدة، وتقرير تقدم تتقنه عبر كافة أجهزتك.'}
        </p>

        {errorMessage && (
          <div className="w-full mb-4 p-3 rounded-2xl bg-status-error/15 border border-status-error/30 text-status-error text-xs font-semibold flex items-center gap-2 text-start animate-fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="w-full mb-4 p-3 rounded-2xl bg-status-success/15 border border-status-success/30 text-status-success text-xs font-semibold flex items-center gap-2 text-start animate-fade-in">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Level Selection for Profile */}
        <div className="w-full mb-6 text-start">
          <label className="block text-xs font-bold text-text-secondary mb-1.5">
            مستواك المستهدف في اللغة الألمانية
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(['A1', 'A2', 'B1', 'B2'] as CEFRLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  setSelectedLevel(lvl);
                  triggerHaptic('light');
                }}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  selectedLevel === lvl
                    ? 'bg-primary/20 border-primary text-primary shadow-glow-purple'
                    : 'bg-surface-card border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Real Google Identity Services Button Container */}
        <div className="w-full flex flex-col items-center justify-center space-y-3">
          <div
            ref={googleBtnContainerRef}
            className="w-full flex items-center justify-center min-h-[44px]"
          />

          <Button
            size="lg"
            variant="secondary"
            className="w-full flex items-center justify-center gap-3 bg-white text-black hover:bg-neutral-200 border-none font-bold shadow-md active:scale-[0.98] transition-transform"
            onClick={handleTriggerGooglePrompt}
            isLoading={isLoading}
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>
              {mode === 'signin' ? 'المتابعة باستخدام Google' : 'التسجيل السريع باستخدام Google'}
            </span>
          </Button>
        </div>
      </div>

      {/* Footer Security Badge */}
      <div className="text-center text-xs text-text-muted pt-4 pb-1 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-status-success flex-shrink-0" />
        <span>حسابك وبياناتك محمية ومشفرة عبر Google Identity Services.</span>
      </div>
    </div>
  );
};


