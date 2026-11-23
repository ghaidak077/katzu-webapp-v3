import React, { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Globe, Languages, Lock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import {
  TARGET_LANGUAGES,
  TARGET_LANGUAGE_META,
  UI_LANGUAGES,
  UI_LANGUAGE_META,
  type TargetLanguage,
  type UiLanguage,
} from '@/lib/i18n/languages';

/**
 * The language picker: two independent choices, side by side.
 *
 * A row opens the full list rather than showing five options inline, because the
 * list has to name each language in ITS OWN language («العربية», «Bahasa
 * Indonesia», «Deutsch») — that is the one label a learner who cannot yet read
 * the current UI language can still find.
 *
 * Dutch is visible and not selectable, with the reason printed on the row. That
 * is a deliberate product decision, not an unfinished state: a picker that hid
 * the language the owner is building would make the roadmap invisible, and a
 * picker that accepted it would hand a learner a German course under a Dutch
 * label. The row says which it is.
 */
export const LanguagePreferences: React.FC = () => {
  const { uiLanguage, targetLanguage, setUiLanguage, setTargetLanguage, t, dir } = useLanguage();
  const [open, setOpen] = useState<'ui' | 'target' | null>(null);
  const [saved, setSaved] = useState(false);

  const Back = dir === 'rtl' ? ChevronLeft : ChevronRight;

  const announce = () => {
    setSaved(true);
    // A one-shot confirmation: it is not a persistent state and must not stack up.
    window.setTimeout(() => setSaved(false), 2600);
  };

  const chooseUi = (language: UiLanguage) => {
    setUiLanguage(language);
    setOpen(null);
    announce();
  };

  const chooseTarget = (language: TargetLanguage) => {
    if (!setTargetLanguage(language)) return;
    setOpen(null);
    announce();
  };

  return (
    <Card className="p-4 mb-6 space-y-3" data-testid="language-preferences">
      <div className="flex items-center gap-2">
        <Languages className="w-5 h-5 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-bold">{t('language.sectionTitle')}</h2>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">{t('language.sectionHint')}</p>

      <div className="space-y-2">
        <LanguageRow
          testId="language-row-ui"
          icon={<Globe className="w-4 h-4" aria-hidden="true" />}
          label={t('language.uiRowLabel')}
          value={UI_LANGUAGE_META[uiLanguage].nativeName}
          onClick={() => setOpen('ui')}
          chevron={<Back className="w-4 h-4 text-text-muted" aria-hidden="true" />}
        />
        <LanguageRow
          testId="language-row-target"
          icon={<Languages className="w-4 h-4" aria-hidden="true" />}
          label={t('language.targetRowLabel')}
          value={TARGET_LANGUAGE_META[targetLanguage].nativeName}
          valueHint={TARGET_LANGUAGE_META[targetLanguage].nameIn[uiLanguage]}
          onClick={() => setOpen('target')}
          chevron={<Back className="w-4 h-4 text-text-muted" aria-hidden="true" />}
        />
      </div>

      {saved && (
        <p role="status" className="text-micro text-status-learning" data-testid="language-saved">
          {t('language.savedNotice')}
        </p>
      )}

      <Modal isOpen={open === 'ui'} onClose={() => setOpen(null)} title={t('language.chooseUiTitle')}>
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
                    data-testid={`language-option-ui-${code}`}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => chooseUi(code)}
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

      <Modal
        isOpen={open === 'target'}
        onClose={() => setOpen(null)}
        title={t('language.chooseTargetTitle')}
      >
        <div className="space-y-2">
          <p className="text-xs text-text-secondary leading-relaxed">{t('language.targetBody')}</p>
          <ul className="space-y-1" role="list">
            {TARGET_LANGUAGES.map((code) => {
              const meta = TARGET_LANGUAGE_META[code];
              const selected = code === targetLanguage;
              return (
                <li key={code}>
                  <button
                    type="button"
                    data-testid={`language-option-target-${code}`}
                    aria-current={selected ? 'true' : undefined}
                    aria-disabled={meta.available ? undefined : 'true'}
                    disabled={!meta.available}
                    onClick={() => chooseTarget(code)}
                    className={`flex w-full items-start justify-between gap-3 rounded-chip px-3 min-h-touch text-start ${
                      meta.available ? 'pointer-hover:bg-surface-subtle' : 'opacity-70 cursor-not-allowed'
                    }`}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold" lang={meta.bcp47} dir="ltr">
                          {meta.nativeName}
                        </span>
                        {!meta.available && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border-subtle px-2 py-0.5 text-micro text-text-muted">
                            <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                            {t('language.soonBadge')}
                          </span>
                        )}
                      </span>
                      <span className="text-micro text-text-muted">{meta.nameIn[uiLanguage]}</span>
                      {!meta.available && (
                        <span className="text-micro text-text-muted leading-relaxed">
                          {t('language.dutchSoon')}
                        </span>
                      )}
                    </span>
                    {selected && <Check className="w-4 h-4 text-primary" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-micro text-text-muted leading-relaxed">{t('language.nativeNote')}</p>
        </div>
      </Modal>
    </Card>
  );
};

function LanguageRow({
  testId,
  icon,
  label,
  value,
  valueHint,
  onClick,
  chevron,
}: {
  testId: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  valueHint?: string;
  onClick: () => void;
  chevron: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-chip border border-border-subtle px-3 py-2 min-h-touch text-start pointer-hover:bg-surface-subtle"
    >
      <span className="flex items-center gap-2 text-text-secondary">
        {icon}
        <span className="text-xs">{label}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="flex flex-col items-end">
          <span className="text-xs font-bold">{value}</span>
          {valueHint && <span className="text-micro text-text-muted">{valueHint}</span>}
        </span>
        {chevron}
      </span>
    </button>
  );
}
