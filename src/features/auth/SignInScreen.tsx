import React, { useState, useEffect, useRef } from 'react';
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
  // Where Google's own button is in its lifecycle. Until it is `ready` (and on
  // origins Google refuses, such as localhost) Katzu renders a single fallback
  // of its own — exactly one sign-in choice is on screen at any moment.
  // `loading` is a real state, not a failure: Google's script and iframe arrive
  // asynchronously and can take seconds on a cold connection.
  const [gsiStatus, setGsiStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  // Bumping this re-runs the loader after a genuine load failure. Without it a
  // failed script stayed failed for the life of the screen and the fallback
  // answered every tap with the same "check your connection" line.
  const [gsiAttempt, setGsiAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  const googleClientId: string | undefined = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;

  // Initialize Google Identity Services if client ID is configured
  useEffect(() => {
    if (!googleClientId) return;
    // Every run of this effect is a fresh attempt: say so, so a retry never
    // leaves the stale "unavailable" label on screen while it is in flight.
    setGsiStatus('loading');

    let isMounted = true;
    let observer: MutationObserver | undefined;
    const scriptId = 'google-gsi-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const setupGsi = () => {
      if (!isMounted || !window.google?.accounts?.id) return;
      const container = googleBtnContainerRef.current;
      if (!container) return;
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
        });

        container.innerHTML = '';
        // The container is emptied and refilled on every mode switch. Reset the
        // gate with it, otherwise for the moment before Google's button comes
        // back the screen would show neither button: Google's is gone from the
        // DOM and Katzu's is hidden because the flag still says "ready".
        setGsiStatus('loading');
        // Google renders its button inside an iframe titled in Indonesian by
        // default — label the container in Arabic so a screen-reader user
        // hears what the button actually does.
        container.setAttribute('role', 'group');
        container.setAttribute('aria-label', mode === 'signup' ? 'التسجيل السريع باستخدام Google' : 'المتابعة باستخدام Google');
        window.google.accounts.id.renderButton(container, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          width: 280,
          text: mode === 'signup' ? 'signup_with' : 'signin_with',
          locale: 'ar',
        });

        // GSI injects its iframe asynchronously — a fixed 700ms guess was the
        // bug: on a cold or slow connection the guess fired first, the flag
        // stayed false, and Katzu's fallback sat on top of a working (or
        // still-loading) Google button for the rest of the visit. Watch the
        // container instead of guessing, and flip as soon as the button is real.
        observer?.disconnect();
        observer = new MutationObserver(() => {
          if (container.childElementCount > 0) setGsiStatus('ready');
        });
        observer.observe(container, { childList: true });
        if (container.childElementCount > 0) setGsiStatus('ready');
      } catch (err) {
        console.warn('GIS initialization error:', err);
      }
    };

    const onScriptError = () => {
      if (!isMounted) return;
      // Offline, a blocked network or an extension: retrying re-injects the
      // script instead of dead-ending the screen on a single failure.
      console.warn('Google Identity Services failed to load.');
      setGsiStatus('unavailable');
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', setupGsi);
      script.addEventListener('error', onScriptError);
      document.body.appendChild(script);
    } else if (window.google?.accounts?.id) {
      setupGsi();
    } else {
      // A previous attempt is still in flight (or failed): never call setupGsi
      // into a half-loaded SDK, and never leave the screen without a listener.
      script.addEventListener('load', setupGsi);
      script.addEventListener('error', onScriptError);
    }

    return () => {
      isMounted = false;
      observer?.disconnect();
      script?.removeEventListener('load', setupGsi);
      script?.removeEventListener('error', onScriptError);
    };
  }, [googleClientId, mode, gsiAttempt]);

  // Once Google's own button is on screen, the "still loading" note is stale.
  useEffect(() => {
    if (gsiStatus === 'ready') setNoticeMessage('');
  }, [gsiStatus]);

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

      await completeUserAuth(userEmail, userName, idToken, 'A1', typeof payload.sub === 'string' ? payload.sub : undefined);
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
    setNoticeMessage('');
    if (window.google?.accounts?.id) {
      // One Tap is silently skipped by some browsers (FedCM, dismissed prompts).
      // Say so, so a tap never looks like it did nothing.
      window.google.accounts.id.prompt((notification: any) => {
        if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
          setErrorMessage('لم تظهر نافذة Google. اسمح بالنوافذ المنبثقة لهذا الموقع أو حاول مرة أخرى.');
        }
      });
    } else if (gsiStatus === 'loading') {
      // Still arriving. Saying "Google is broken" here was the regression's
      // visible symptom: the tap happened a moment too early and the screen
      // never recovered. Say what is actually true and keep waiting.
      setNoticeMessage('جارٍ تجهيز خدمة Google… انتظر لحظة ثم اضغط مرة أخرى.');
    } else {
      setErrorMessage('تعذر تحميل خدمة Google الآن. تحقق من الاتصال وحاول مجدداً.');
      // Load the script again, so "try again" can actually succeed. The failed
      // element must go first: re-listening to it would never fire again.
      document.getElementById('google-gsi-script')?.remove();
      setGsiAttempt((attempt) => attempt + 1);
    }
  };

  // Without a client ID Google sign-in cannot work. The setup detail is a
  // build-configuration fault for the developer, so it goes to the console; the
  // learner gets a calm, honest state with a clear way forward.
  if (!googleClientId) {
    console.error(
      'VITE_GOOGLE_CLIENT_ID is not set: Google sign-in is unavailable in this build.',
    );
    return (
      <div className="min-h-screen flex flex-col justify-between p-6 bg-black text-text-primary max-w-md mx-auto relative font-arabic">
        <div>
          <BackButton onBack={onBack} className="mb-6" />
        </div>

        <div className="flex flex-col items-center text-center my-auto px-2 space-y-4" role="status">
          <KatzuMascot name="avatar" className="w-20 h-20 mb-1 object-contain" />

          <h2 className="text-xl font-bold text-text-primary">
            تسجيل الدخول غير متاح الآن
          </h2>

          <p className="text-xs text-text-secondary leading-relaxed max-w-sm">
            لا يمكن إكمال تسجيل الدخول بحساب Google في هذه النسخة. يمكنك متابعة التعلم بدون حساب الآن، وسنعيد فتح تسجيل الدخول لاحقاً.
          </p>

          <Button
            size="md"
            variant="primary"
            className="w-full mt-4"
            onClick={onBack}
          >
            العودة والمتابعة بدون حساب
          </Button>
        </div>

        <div className="text-center text-xs text-text-muted pt-4 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span>حسابك وبياناتك محمية عبر Google Identity Services.</span>
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
            className={`min-h-touch py-2 rounded-control text-xs font-bold transition-colors duration-fast ease-out ${
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
            className={`min-h-touch py-2 rounded-control text-xs font-bold transition-colors duration-fast ease-out ${
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
          <div role="alert" className="w-full mb-4 p-3 rounded-2xl bg-status-error/15 border border-status-error/30 text-status-error text-xs font-semibold flex items-center gap-2 text-start">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div role="status" className="w-full mb-4 p-3 rounded-2xl bg-status-success/15 border border-status-success/30 text-status-success text-xs font-semibold flex items-center gap-2 text-start">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {noticeMessage && (
          <div role="status" className="w-full mb-4 p-3 rounded-2xl bg-surface-card border border-border-subtle text-text-secondary text-xs font-semibold flex items-center gap-2 text-start">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 text-primary" />
            <span>{noticeMessage}</span>
          </div>
        )}

        {/* A3: no level picker on the sign-in tab. The level is a measurement, not
            a sign-up field: it is set by the optional placement check (offered on the
            debrief) and stays A1 until measured. Profile still lets anyone change it. */}

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
              gsiStatus === 'ready' && 'min-h-[44px]',
            )}
          />
          {gsiStatus !== 'ready' && (
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


