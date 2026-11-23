import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { UI_STRINGS, type UiStringKey } from '@/lib/i18n/strings';
import { UI_LANGUAGES, UI_LANGUAGE_META } from '@/lib/i18n/languages';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

/**
 * The review surface for translated copy. Development builds only.
 *
 * WHY THIS EXISTS
 * `scripts/i18n-strings.mjs` exports a worksheet, which is the right shape for a
 * translator sitting at a spreadsheet — and the wrong shape for the two people
 * who can actually judge a sentence: someone who has never seen the product and
 * someone who has. This page is for them. Every string sits next to the Arabic
 * it is supposed to mean and the other two languages, grouped by the feature it
 * belongs to, with the screens that render it one tap away.
 *
 * The one thing it deliberately does NOT do is pretend "identical to Arabic"
 * means "untranslated". `Katzu Pro`, `A1`, `Google` are identical on purpose, so
 * the row marks the coincidence and lets the reviewer decide — a counter that
 * guessed would be wrong in both directions.
 *
 * It never writes. Editing copy through a browser tab would put the dictionary's
 * only copy in a database with no diff, no review and no gate; a reviewed
 * worksheet (`--apply`) keeps every change reviewable in git.
 */
export const I18nReviewScreen: React.FC = () => {
  const { uiLanguage } = useLanguage();
  const [query, setQuery] = useState('');

  const keys = useMemo(() => Object.keys(UI_STRINGS.ar) as UiStringKey[], []);
  const groups = useMemo(() => {
    const byPrefix = new Map<string, UiStringKey[]>();
    for (const key of keys) {
      const prefix = key.split('.')[0] ?? key;
      const list = byPrefix.get(prefix) ?? [];
      list.push(key);
      byPrefix.set(prefix, list);
    }
    return [...byPrefix.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [keys]);

  const needle = query.trim().toLowerCase();
  const filtered = (list: UiStringKey[]) =>
    needle
      ? list.filter(
          (key) =>
            key.toLowerCase().includes(needle) ||
            UI_LANGUAGES.some((language) => UI_STRINGS[language][key].toLowerCase().includes(needle)),
        )
      : list;

  const visible = groups
    .map(([prefix, list]) => [prefix, filtered(list)] as const)
    .filter(([, list]) => list.length > 0);

  const total = visible.reduce((sum, [, list]) => sum + list.length, 0);
  const identical = keys.filter((key) => UI_LANGUAGES.every((language) => UI_STRINGS[language][key] === UI_STRINGS.ar[key])).length;

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-black p-5 text-text-primary">
      <header className="mb-4">
        <h1 className="text-xl font-bold">Dictionary review</h1>
        <p className="mt-1 text-xs text-text-secondary leading-relaxed">
          {keys.length} keys in {UI_LANGUAGES.length} languages. Arabic is the reference; English and Indonesian are
          native copy, not literal renderings. {identical} key(s) are identical in all three (names, levels, codes) —
          those are expected.
        </p>
        <p className="mt-1 text-micro text-text-muted">
          Review, then edit the worksheet and run <code>npm run i18n:strings -- --apply</code>. This page never writes.
        </p>
      </header>

      <label className="mb-4 flex items-center gap-2 rounded-chip border border-border-subtle bg-surface-card px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by key or by any language…"
          aria-label="Filter dictionary"
          className="min-w-0 flex-1 bg-transparent text-sm"
        />
        <span className="text-micro text-text-muted">{total}</span>
      </label>

      {visible.map(([prefix, list]) => (
        <section key={prefix} className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
            {prefix} <span className="font-normal normal-case">({list.length})</span>
          </h2>
          <ul className="space-y-2">
            {list.map((key) => (
              <li key={key} className="rounded-chip border border-border-subtle bg-surface-card p-3">
                <p className="mb-1.5 font-mono text-micro text-text-muted">{key}</p>
                <div className="space-y-1">
                  {UI_LANGUAGES.map((language) => {
                    const meta = UI_LANGUAGE_META[language];
                    const value = UI_STRINGS[language][key];
                    const same = value === UI_STRINGS.ar[key];
                    return (
                      <div key={language} className="flex gap-2 text-sm leading-relaxed">
                        <span
                          className="w-6 shrink-0 text-micro text-text-faint"
                          title={meta.englishName}
                        >
                          {language}
                        </span>
                        <span
                          lang={meta.bcp47}
                          dir={meta.dir}
                          className={language === uiLanguage ? 'text-text-primary' : 'text-text-secondary'}
                        >
                          {value}
                        </span>
                        {same && language !== 'ar' ? (
                          <span
                            className="ms-auto shrink-0 self-start rounded-full border border-border-subtle px-1.5 text-micro text-text-faint"
                            title="Identical to the Arabic. Expected for names, levels and codes; suspicious for a sentence."
                          >
                            =
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!visible.length ? <p className="text-sm text-text-secondary">Nothing matches “{query}”.</p> : null}
    </div>
  );
};
