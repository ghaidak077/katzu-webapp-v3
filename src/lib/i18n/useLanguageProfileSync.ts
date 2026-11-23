import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { useLanguage } from './LanguageProvider';
import { isTargetLanguage, isUiLanguage, TARGET_LANGUAGE_META } from './languages';
import { readStoredUiLanguage } from './languagePreference';
import { track } from '@/lib/analytics/client';

/**
 * Keeps the signed-in profile and the device's own choice in step.
 *
 * The device owns the language it is currently painting (`localStorage`, read
 * synchronously); the profile row is the copy that lets the choice follow a
 * learner to a second device. Both directions matter and they must not fight:
 *
 *   • **profile → device**: only when this device has never recorded a choice.
 *     A learner who deliberately picked English on this phone must not be
 *     flipped back to Arabic by an older row on their account.
 *   • **device → profile**: on every change, best-effort. A failed write is not a
 *     failed language switch — the UI already changed and will again on reload.
 *
 * Mounted inside the app shell, never in the entry bundle: it imports Dexie.
 */
export function useLanguageProfileSync(): void {
  const { uiLanguage, targetLanguage, setUiLanguage, setTargetLanguage } = useLanguage();
  const user = useLiveQuery(() => db.users.get('current_user'));
  const adoptedRef = useRef(false);
  const lastWrittenRef = useRef<string>('');
  const reportedRef = useRef(false);

  /**
   * Demand, measured.
   *
   * The product could say which language it was PAINTING and never which one
   * anyone was using, so the decision "how much English/Indonesian is worth
   * translating" had no evidence behind it. One event per open carries the pair;
   * a change carries one more. Codes only — no text, no account, no route.
   */
  useEffect(() => {
    const props = { uiLang: uiLanguage, targetLang: targetLanguage };
    if (!reportedRef.current) {
      reportedRef.current = true;
      track('language_active', props);
      return;
    }
    track('language_selected', props);
  }, [uiLanguage, targetLanguage]);

  // Adopt a stored profile choice exactly once, and only on a device that has no
  // opinion of its own yet.
  useEffect(() => {
    if (adoptedRef.current || user === undefined || user?.isLoggedIn !== true) return;
    adoptedRef.current = true;
    const deviceHasChoice = readStoredUiLanguage() !== null;
    if (!deviceHasChoice && isUiLanguage(user.uiLanguage)) {
      setUiLanguage(user.uiLanguage);
    }
    if (isTargetLanguage(user.targetLanguage)) {
      setTargetLanguage(user.targetLanguage);
    }
  }, [user, setUiLanguage, setTargetLanguage]);

  // Mirror this device's current pair into the profile, de-duplicated so a
  // re-render cannot cause a write loop (the live query re-emits on every write).
  useEffect(() => {
    if (user === undefined || user?.isLoggedIn !== true) return;
    const key = `${uiLanguage}:${targetLanguage}`;
    if (lastWrittenRef.current === key) return;
    if (user.uiLanguage === uiLanguage && user.targetLanguage === targetLanguage) {
      lastWrittenRef.current = key;
      return;
    }
    // A course that is not shipped is never written to the profile.
    if (!TARGET_LANGUAGE_META[targetLanguage]?.available) return;
    lastWrittenRef.current = key;
    void db.users
      .update('current_user', { uiLanguage, targetLanguage, updatedAt: Date.now() })
      .catch(() => {
        // Best-effort: the choice is already applied and stored on the device.
      });
  }, [user, uiLanguage, targetLanguage]);
}
