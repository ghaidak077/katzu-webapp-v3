import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { db } from '@/lib/db/katzuDb';
import { workerClient } from '@/lib/api/workerClient';
import { triggerHaptic } from '@/lib/utils/haptics';
import { track } from '@/lib/analytics/client';
import {
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Settings,
  Lock,
} from 'lucide-react';
import type { CEFRLevel } from '@/types/models';
import { BackButton } from '@/components/common/BackButton';
import { GoogleSignInButton } from '@/components/common/GoogleMark';

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
  // True once Google has actually drawn its own button. Until then (and on
  // origins Google refuses, such as localhost) Katzu renders a single fallback
  // of its own — exactly one sign-in choice is on screen at any moment.
  const [googleButtonRendered, setGoogleButtonRendered] = useState(false);
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
          // The container is emptied and refilled on every mode switch. Reset the
          // gate with it, otherwise for the ~700ms before Google's button comes
          // back the screen would show neither button: Google's is gone from the
          // DOM and Katzu's is hidden because the flag still says "rendered".
          setGoogleButtonRendered(false);
          // Google renders its button inside an iframe titled in Indonesian by
          // default — label the container in Arabic so a screen-reader user
          // hears what the button actually does.
          googleBtnContainerRef.current.setAttribute('role', 'group');
          googleBtnContainerRef.current.setAttribute('aria-label', mode === 'signup' ? 'التسجيل السريع باستخدام Google' : 'المتابعة باستخدام Google');
          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            width: 280,
            text: mode === 'signup' ? 'signup_with' : 'signin_with',
            locale: 'ar',
          });

          // Google refuses to draw its button on an origin that is not in the
          // console's Authorized JavaScript origins list — which is exactly the
          // case on `http://localhost`. GSI injects asynchronously, so the only
          // honest check is whether anything actually appeared.
          window.setTimeout(() => {
            if (isMounted) {
              setGoogleButtonRendered(googleBtnContainerRef.current!.childElementCount > 0);
            }
          }, 700);
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
    level: CEFRLevel = 'A1',
    accountId?: string,
  ) => {
    const cleanEmail = userEmail.trim().toLowerCase();
    const cleanName = userDisplayName.trim() || cleanEmail.split('@')[0] || 'طالب كَاتْزُو';

    // Security (Phase 1.1b): the raw Google ID token is used ONCE here — exchanged
    // for a server session — and is NEVER written to IndexedDB. If the exchange
    // fails, sign-in fails honestly: the user retries sign-in (re-running the
    // Google flow). There is no raw-token fallback.
    let sessionToken: string | undefined = undefined;
    try {
      const sessionResult = await workerClient.exchangeGoogleToken(idToken);
      if (sessionResult?.session_token) {
        sessionToken = sessionResult.session_token;
      }
    } catch (sessionErr) {
      console.warn('Could not exchange token with worker session endpoint:', sessionErr);
    }

    if (!sessionToken) {
      setErrorMessage('تعذر تأمين جلسة الدخول. تحقق من اتصالك وحاول تسجيل الدخول مرة أخرى.');
      setIsLoading(false);
      return;
    }

    await db.users.update('current_user', {
      email: cleanEmail,
      googleAccountEmail: cleanEmail,
      displayName: cleanName,
      // idToken is deliberately NOT persisted (only cleared from any legacy row).
      idToken: undefined,
      sessionToken,
      accountId,
      isLoggedIn: true,
      cefrLevel: level,
      updatedAt: Date.now(),
    });

    // Synchronize cloud subscription status and restore progress
    const activeAuthToken = sessionToken;
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
      // Same call restores the memory queue: a learner who signs in on a new
      // device gets back the schedule of everything due for review, not an
      // empty queue that silently starts their memory from zero again.
      await workerClient.syncReviewQueue(activeAuthToken);
    } catch (err) {
      console.warn('Progress restore error on login:', err);
    }

    triggerHaptic('success');
    if (mode === 'signup') track('signup_completed');
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

    // A signup that starts at Google's own button cannot be caught by a click
    // handler — GSI draws that button inside a cross-origin iframe. Firing here
    // records the same funnel step at the moment it actually completes.
    if (mode === 'signup') track('signup_started', { source: 'google_button' });

    setIsLoading(true);
    setErrorMessage('');
    try {
      const payload = decodeJwt(idToken) || {};
      const userEmail = payload.email;
      if (!userEmail) {
        throw new Error('Missing email in Google ID token');
      }
      const userName = payload.name || payload.given_name || 'مستخدم كَاتْزُو';

      await completeUserAuth(userEmail, userName, idToken, selectedLevel, typeof payload.sub === 'string' ? payload.sub : undefined);
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
    } else {
      setErrorMessage('تعذر تحميل خدمة Google الآن. تحقق من الاتصال وحاول مجدداً.');
    }
  };

  // If VITE_GOOGLE_CLIENT_ID is missing, render configuration error screen
  if (!googleClientId) {
    return (
      <div className="min-h-screen flex flex-col justify-between p-6 bg-black text-text-primary max-w-md mx-auto relative font-arabic">
        <div>
          <BackButton onBack={onBack} className="mb-6" />
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
            <div className="p-2.5 bg-black rounded-xl font-mono text-micro text-accent-light border border-border-subtle break-all">
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
          <BackButton onBack={onBack} className="mb-6" />
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
            className={`min-h-touch py-2 rounded-xl text-xs font-bold transition-colors duration-fast ease-out ${
              mode === 'signin'
                ? 'bg-fill text-on-fill shadow-glow-purple'
                : 'text-text-secondary pointer-hover:text-text-primary'
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              track('signup_started', { source: 'tab' });
              setErrorMessage('');
              triggerHaptic('light');
            }}
            className={`min-h-touch py-2 rounded-xl text-xs font-bold transition-colors duration-fast ease-out ${
              mode === 'signup'
                ? 'bg-fill text-on-fill shadow-glow-purple'
                : 'text-text-secondary pointer-hover:text-text-primary'
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
          <div className="w-full mb-4 p-3 rounded-2xl bg-status-error/15 border border-status-error/30 text-status-error text-xs font-semibold flex items-center gap-2 text-start">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="w-full mb-4 p-3 rounded-2xl bg-status-success/15 border border-status-success/30 text-status-success text-xs font-semibold flex items-center gap-2 text-start">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Level selection — SIGN-UP ONLY.

            V32: a returning learner was asked to re-pick a level the app already
            stores, and the A1/A2/B1/B2 row read as a third primary action on a
            screen whose only job is "sign in". Profile still lets anyone change
            their level later, so nothing is lost by not asking twice. */}
        {mode === 'signup' && (
        <div className="w-full mb-6 text-start">
          <label className="block text-xs font-bold text-text-secondary mb-1.5">
            مستواك المستهدف في اللغة الألمانية — تقدير أولي، سنضبطه بالمحادثة
          </label>
          <div className="grid grid-cols-5 gap-2">
            {(['A0', 'A1', 'A2', 'B1', 'B2'] as CEFRLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  setSelectedLevel(lvl);
                  triggerHaptic('light');
                }}
                className={`min-h-touch min-w-touch py-2 rounded-xl text-xs font-bold border transition-colors duration-fast ease-out ${
                  selectedLevel === lvl
                    ? 'bg-primary/20 border-primary text-primary shadow-glow-purple'
                    : 'bg-surface-card border-border-subtle text-text-secondary pointer-hover:text-text-primary'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Exactly one sign-in button at a time. Google Identity Services draws
            the official button into this container on origins Google trusts; on
            the ones it refuses (localhost, and any host missing from Authorized
            JavaScript origins) it renders nothing, and Katzu's own button stands
            in — behind the same `accounts.id.prompt()` call, so it works there
            too. Showing both at once is what put two identical choices 12px
            apart on the live sign-in page. */}
        <div className="w-full flex flex-col items-center justify-center">
          <div
            ref={googleBtnContainerRef}
            className={cn(
              'w-full flex items-center justify-center',
              googleButtonRendered && 'min-h-[44px]',
            )}
          />
          {!googleButtonRendered && (
            <GoogleSignInButton
              onClick={handleTriggerGooglePrompt}
              isLoading={isLoading}
              label={
                mode === 'signin'
                  ? 'المتابعة باستخدام Google'
                  : 'التسجيل السريع باستخدام Google'
              }
            />
          )}
          {isLoading && (
            <p className="mt-3 text-caption text-text-secondary" role="status" aria-live="polite">
              جارٍ التحقق من الحساب...
            </p>
          )}
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


