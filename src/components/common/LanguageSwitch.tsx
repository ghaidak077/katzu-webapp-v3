import React, { useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { UI_LANGUAGES, UI_LANGUAGE_META } from '@/lib/i18n/languages';

/**
 * The language switch a visitor can reach BEFORE signing in.
 *
 * Language is a first-run decision, not an account setting: someone arriving on
 * a phone set to Indonesian must be able to read the front door without creating
 * an account first. The Profile picker (`LanguagePreferences`) is the same matrix
 * plus the course; this is deliberately only the UI language, because the course
 * is a learning decision that belongs next to the level, not on the poster.
 *
 * Each option is named in its own language — «العربية», «English», «Bahasa
 * Indonesia» — which is the one label a reader who cannot yet read the current
 * UI language can still find.
 */
export const LanguageSwitch: React.FC<{ className?: string }> = ({ className }) => {
  const { uiLanguage, setUiLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-testid="language-switch"
        onClick={() => setOpen(true)}
        aria-label={t('language.uiRowLabel')}
        className={`inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-3 min-h-touch text-micro text-text-secondary pointer-hover:bg-surface-subtle ${className || ''}`}
      >
        <Globe className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{UI_LANGUAGE_META[uiLanguage].nativeName}</span>
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={t('language.chooseUiTitle')}>
        <div className="space-y-2">
          <p className="text-xs text-text-secondary leading-relaxed">{t('language.uiBody')}</p>
          <ul className="space-y-1" role="list">
            {UI_LANGUAGES.map((code) => {
              const meta = UI_LANGUAGE_META[code];
              const selected = code === uiLanguage;
              return (
                <li key={code}>
                  <button
                    type="button"
                    data-testid={`language-switch-option-${code}`}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => {
                      setUiLanguage(code);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-chip px-3 min-h-touch text-start pointer-hover:bg-surface-subtle"
                    lang={meta.bcp47}
                    dir={meta.dir}
                  >
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">{meta.nativeName}</span>
                      <span className="text-micro text-text-muted" lang="en" dir="ltr">
                        {meta.englishName}
                      </span>
                    </span>
                    {selected && <Check className="w-4 h-4 text-primary" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </>
  );
};
