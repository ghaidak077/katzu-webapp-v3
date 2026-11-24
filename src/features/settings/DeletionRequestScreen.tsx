import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BackButton } from '@/components/common/BackButton';
import { workerClient } from '@/lib/api/workerClient';
import { db, wipeUserScopedData } from '@/lib/db/katzuDb';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { translate } from '@/lib/i18n/strings';
import type { UiLanguage } from '@/lib/i18n/languages';

/**
 * The public deletion-request page.
 *
 * WHY IT EXISTS BESIDE THE IN-APP BUTTON
 * GDPR erasure has a deadline and the in-app path depends on a session the
 * learner still has: a browser that lost its token, a device that was wiped, or
 * someone asking on behalf of a learner who never got the app working. This page
 * works from a link alone, explains exactly what is deleted, and — for a learner
 * who IS still signed in — hands them the one-tap path rather than a mailbox.
 *
 * WHAT IT NEVER ASKS FOR
 * No password, no recovery phrase, no card. A request identifies itself with the
 * account's own email, and that is the whole credential.
 *
 * WHAT IT NEVER CLAIMS
 * There is no server route that queues a deletion request — the mailbox IS the
 * route — so this page never says a request was received. It opens the draft and
 * says plainly that the learner sends it. Before this, a signed-out learner was
 * told «استلمنا طلبك عبر البريد» after a call that could only have failed, which
 * is a false receipt for an erasure request: the one sentence on this page that
 * must not be wrong.
 */

/** The one address this page can hand out without a session. */
const SUPPORT_EMAIL = 'support@ghaidak.com';

/** The prefilled draft, carrying the email the learner typed as identification. */
function draftHref(email: string, language: UiLanguage): string {
  const subject = encodeURIComponent(translate(language, 'delete.mailSubject'));
  const body = encodeURIComponent(translate(language, 'delete.mailBody', { email }));
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export const DeletionRequestScreen: React.FC = () => {
  const { t, uiLanguage } = useLanguage();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'draft' | 'deleted' | 'badEmail' | 'failed'>('idle');
  const [busy, setBusy] = useState(false);
  // The signed-in path deletes immediately, so it asks for the same typed word
  // the Profile screen asks for before anything irreversible happens.
  const [confirmText, setConfirmText] = useState('');

  // The same source of truth the shell uses for its own gate, read once: this is
  // a one-shot action page, not a live view. `null` means the row has not
  // answered yet, which is NOT the same as "signed out" — offering the mailbox
  // to a learner who could have had a one-tap deletion is its own small
  // dishonesty, so the button waits for the answer. (A `useLiveQuery` cannot
  // tell the two apart here: it reports the same `undefined` for "loading" and
  // for "no row", and a signed-out visitor has no row.)
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void db.users
      .get('current_user')
      .then((row) => {
        if (alive) setSignedIn(row?.isLoggedIn === true);
      })
      .catch(() => {
        if (alive) setSignedIn(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  const sessionKnown = signedIn !== null;

  const handleRequest = async () => {
    // The address has a job only on the signed-out branch, which cannot call the
    // server: it opens the mail draft. A signed-in learner has no address field on
    // screen at all, so requiring one here would leave the one-tap deletion
    // unreachable — the button would answer «اكتب بريداً صحيحاً» forever.
    if (signedIn !== true) {
      const value = email.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
        setStatus('badEmail');
        return;
      }
      window.location.href = draftHref(value, uiLanguage);
      setStatus('draft');
      return;
    }
    setBusy(true);
    // A signed-in learner is deleted immediately, server-side, through the same
    // path the settings screen uses — the request page never queues a request it
    // could have fulfilled itself.
    const result = await workerClient.deleteAccount();
    setBusy(false);
    // The confirmation follows the server's answer, not the attempt.
    setStatus(result.success ? 'deleted' : 'failed');
    if (result.success) {
      // The copy above promises the deletion covers THIS device too, and the
      // server route cannot know about a device — so the local wipe is this
      // page's job, exactly as the in-app settings screen performs it. Leaving
      // the row behind would keep the learner signed in to a deleted account
      // with all of their data still on the phone.
      await wipeUserScopedData();
      setTimeout(() => navigate('/signin'), 1500);
    }
  };

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        {/* This page is public and is often reached by a bare link, so "back"
            cannot be history: a visitor with no history would leave the site, and
            one signed in would be dropped on a protected route they may not have
            opened. It follows the same rule `TrustRoute` does. */}
        <BackButton
          onBack={() => navigate(signedIn === true ? '/app/profile' : '/')}
          label={t('a11y.back')}
        />
        <h1 className="text-xl font-bold font-arabic">{t('delete.title')}</h1>
      </div>
      <Card className="p-5 space-y-4">
        <Trash2 className="w-7 h-7 text-status-error" />
        <p className="text-sm leading-7 text-text-secondary font-arabic">
          {t('delete.intro')}
        </p>
        <p className="text-sm leading-7 text-text-secondary font-arabic">
          {signedIn === true ? (
            <>
              {t('delete.signedInBody')}
            </>
          ) : (
            <>
              {t('delete.signedOutBody1')}
              <span className="font-bold"> {SUPPORT_EMAIL}</span>. {t('delete.signedOutBody2')}
            </>
          )}
        </p>

        {status === 'draft' ? (
          <p role="status" className="text-sm font-arabic text-status-success">
            {t('delete.draftNotice')}
          </p>
        ) : null}
        {status === 'deleted' ? (
          <p role="status" className="text-sm font-arabic text-status-success">
            {t('delete.deletedNotice')}
          </p>
        ) : null}
        {status === 'badEmail' ? (
          <p role="alert" className="text-sm font-arabic text-status-error">
            {t('delete.badEmail')}
          </p>
        ) : null}
        {status === 'failed' ? (
          <p role="alert" className="text-sm font-arabic text-status-error">
            {t('delete.failedNotice1')}
            <span className="font-bold"> {SUPPORT_EMAIL}</span> {t('delete.failedNotice2')}
          </p>
        ) : null}

        {signedIn === true ? (
          <label className="block text-sm font-arabic text-text-secondary">
            {t('delete.confirmLabel1')}{' '}
            <span className="font-bold">{t('delete.confirmWord')}</span>{' '}
            {t('delete.confirmLabel2')}
            <input
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={t('delete.confirmWord')}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm font-arabic"
              autoComplete="off"
            />
          </label>
        ) : (
        <label className="block text-sm font-arabic text-text-secondary">
          {t('delete.emailLabel')}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
            dir="ltr"
          />
        </label>
        )}

        <Button
          className="w-full"
          disabled={busy || !sessionKnown || (signedIn === true && confirmText.trim() !== t('delete.confirmWord'))}
          onClick={() => void handleRequest()}
        >
          {busy ? t('delete.busy') : signedIn ? t('delete.deleteNow') : t('delete.openDraft')}
        </Button>

        {status === 'draft' ? (
          <a
            href={draftHref(email.trim(), uiLanguage)}
            className="block text-center text-sm font-arabic text-kz-lavender underline"
          >
            {t('delete.reopen')}
          </a>
        ) : null}

        <p className="text-xs leading-6 text-text-muted font-arabic">
          {t('delete.noPassword')}
        </p>
      </Card>
    </div>
  );
};
