import React from 'react';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GoogleSignInButton } from '@/components/common/GoogleMark';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { db } from '@/lib/db/katzuDb';
import { logError } from '@/lib/utils/diagnostics';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { LanguageSwitch } from '@/components/common/LanguageSwitch';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

/**
 * V32: what Katzu calls you when you would rather not say. It is stored on the
 * learner row and then rendered inside conversations, so it is dictionary copy
 * too — an English learner should be greeted as «learner», not in Arabic.
 */

export interface WelcomeScreenProps {
  onGoToSignIn: (mode?: 'signin' | 'signup') => void;
}

/**
 * The front door: one promise, one exchange, one button.
 *
 * 2026-11-19: the screen used to open on a signup form — a name field, a
 * "create account" button, a Google button and a returning-learner button, all
 * before the learner had seen a single German sentence. For an app that sells
 * conversation, showing the exchange first is the honest proof. The name field
 * moved out: it was the only thing collected here, it was optional anyway, and
 * it is editable in Profile.
 *
 * 2026-11-23: every sentence here comes from the dictionary, because this is the
 * one screen a stranger sees before deciding whether the app speaks their
 * language. The German stays German in all three locales (it is the lesson), and
 * the glosses around it are translated: an Indonesian learner reads what the
 * exchange means in Indonesian, not in Arabic.
 */
export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onGoToSignIn }) => {
  const { t, uiLanguage } = useLanguage();
  // Arabic has its own face; English and Indonesian must not inherit it.
  const arabic = uiLanguage === 'ar' ? 'font-arabic' : '';

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await db.users.update('current_user', {
        displayName: t('welcome.defaultName'),
        updatedAt: Date.now(),
      });
    } catch (err) {
      // A failed local write must not trap the learner on the front door: the
      // name is optional, so log it and continue to sign-up with the default.
      logError('welcome', `Could not save display name: ${err instanceof Error ? err.message : String(err)}`);
    }
    onGoToSignIn('signup');
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-6 bg-black text-text-primary max-w-md mx-auto relative overflow-hidden">
      {/* Background glow circle */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header Tag */}
      <div className="w-full flex justify-center pt-2">
        <Badge variant="primary" size="md">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          {t('welcome.badge')}
        </Badge>
      </div>

      {/* Hero Sticker & Title */}
      <div className="flex flex-col items-center text-center mt-6">
        <KatzuMascot name="welcome" glow className="w-36 h-36 object-contain mb-4" />

        <h1 className={`text-3xl font-bold mb-2 text-text-primary tracking-tight ${arabic}`}>
          {t('welcome.headline')}
        </h1>
        <p className={`text-sm text-text-secondary leading-relaxed px-4 ${arabic}`}>
          {t('welcome.subline')}
        </p>
      </div>

      {/* One real exchange — the product, shown before it is bought. */}
      <div className="w-full mt-6 space-y-2 text-start" aria-label={t('welcome.demoLabel')}>
        <p className={`text-micro text-text-muted px-1 ${arabic}`}>{t('welcome.demoCaption')}</p>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="text-caption font-semibold text-text-primary" dir="ltr" lang="de">
            Guten Tag! Was darf es sein?
          </p>
          <p className={`mt-0.5 text-micro text-text-muted ${arabic}`}>{t('welcome.demoSceneGloss')}</p>
        </div>

        <div className="rounded-2xl border border-primary/25 bg-primary/10 px-3 py-2">
          <p className={`text-caption text-text-primary ${arabic}`}>{t('welcome.demoLearnerLine')}</p>
          <p className="mt-0.5 text-micro text-primary" dir="ltr" lang="de">
            Ich möchte einen Kaffee, bitte.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
          <p className={`text-micro leading-relaxed text-text-secondary ${arabic}`}>
            <span className="font-bold text-text-primary">{t('welcome.demoSpeaker')}</span>{' '}
            {t('welcome.demoCoach')}{' '}
            <span className="font-semibold text-text-primary" dir="ltr" lang="de">
              Ich möchte einen Kaffee, bitte.
            </span>
          </p>
        </div>
      </div>

      {/* One primary action. */}
      {/* The front door is readable before an account exists: a visitor can pick
          the app language here, and the choice follows them into the app. */}
      <div className="w-full flex justify-center mt-5">
        <LanguageSwitch />
      </div>

      <form onSubmit={handleStart} className="w-full mt-6 space-y-3">
        <Button type="submit" size="lg" className={`w-full ${arabic}`}>
          {t('welcome.start')}
          <ArrowLeft className="w-5 h-5 me-2" />
        </Button>

        <div className="flex items-center gap-3 w-full pt-1 pb-0.5">
          <div className="h-[1px] bg-border-subtle flex-1" />
          <span className={`text-micro text-text-muted ${arabic}`}>{t('welcome.quickDivider')}</span>
          <div className="h-[1px] bg-border-subtle flex-1" />
        </div>

        <GoogleSignInButton onClick={() => onGoToSignIn('signup')} label={t('welcome.continueWithGoogle')} />
      </form>

      {/* Footer Sign-in / Sign-up link & Attribution */}
      <div className="w-full flex flex-col items-center gap-3 mt-6 pb-2">
        {/* Returning learners get one obvious door, separate from the new-account
            button above. Tapping "ابدأ" always opens sign-up, so say so here. */}
        <div className="w-full flex flex-col items-center gap-2">
          <p className={`text-xs text-text-secondary ${arabic}`}>{t('welcome.haveAccount')}</p>
          <Button
            type="button"
            size="md"
            variant="outline"
            className={`w-full ${arabic}`}
            onClick={() => onGoToSignIn('signin')}
          >
            {t('welcome.signIn')}
          </Button>
        </div>

        <p className={`text-micro text-text-muted ${arabic}`}>{t('welcome.attribution')}</p>
      </div>

    </div>
  );
};
