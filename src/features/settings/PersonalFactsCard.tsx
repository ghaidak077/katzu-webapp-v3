import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Edit2, Sparkles, Trash2, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { GOAL_COPY } from '@/lib/onboarding/preferences';
import type { LearnerGoal } from '@/types/models';
import {
  clearPersonalFact,
  readPersonalFacts,
  savePersonalFact,
  type PersonalFact,
  type PersonalFactKind,
} from '@/lib/memory/personalFacts';

/**
 * «ما نتذكره عنك» — the four personal facts, on one card.
 *
 * This is the learner's own copy of their memory: every value is readable here,
 * every value can be corrected, and every value can be deleted. Nothing on this
 * card comes from the server, and nothing leaves the device.
 */
export const PersonalFactsCard: React.FC = () => {
  const facts = useLiveQuery(() => readPersonalFacts(), [], null);
  const [editing, setEditing] = useState<PersonalFactKind | null>(null);
  const [draft, setDraft] = useState('');

  if (facts === null) return null;

  const startEdit = (fact: PersonalFact) => {
    setEditing(fact.kind);
    setDraft(fact.value ?? '');
  };

  const cancel = () => {
    setEditing(null);
    setDraft('');
  };

  const save = async (kind: PersonalFactKind) => {
    await savePersonalFact(kind, draft);
    cancel();
  };

  const remove = async (kind: PersonalFactKind) => {
    await clearPersonalFact(kind);
    if (editing === kind) cancel();
  };

  return (
    <Card className="p-4 mb-6 space-y-3" data-testid="personal-facts-card">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold text-text-secondary">ما نتذكره عنك</span>
      </div>
      <p className="text-micro font-arabic text-text-muted leading-relaxed">
        الاسم والمدينة والمهنة والهدف — تبقى على جهازك فقط، ويستخدمها كَاتْزُو ليناديك ويشير إليها في
        الحديث. لا تُرسل إلى خادمنا ولا إلى أي جهة أخرى. يمكنك تصحيح أي قيمة أو حذفها الآن.
      </p>
      <ul className="space-y-2">
        {facts.map((fact) => (
          <li
            key={fact.kind}
            data-testid={`personal-fact-${fact.kind}`}
            className="rounded-xl bg-surface-subtle border border-border-subtle px-3 py-2"
          >
            {editing === fact.kind ? (
              <div className="flex items-center gap-2">
                {fact.kind === 'goal' ? (
                  <select
                    aria-label={fact.labelAr}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg bg-surface-base border border-border-subtle px-2 py-1.5 text-xs font-arabic text-text-primary"
                  >
                    <option value="">بلا هدف محدد</option>
                    {(Object.keys(GOAL_COPY) as LearnerGoal[]).map((goal) => (
                      <option key={goal} value={goal}>
                        {GOAL_COPY[goal].labelAr}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={fact.labelAr}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={60}
                    className="min-w-0 flex-1 rounded-lg bg-surface-base border border-border-subtle px-2 py-1.5 text-xs font-arabic text-text-primary"
                  />
                )}
                <button
                  type="button"
                  onClick={() => void save(fact.kind)}
                  aria-label="حفظ"
                  className="shrink-0 rounded-full p-1.5 text-status-success"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  aria-label="إلغاء"
                  className="shrink-0 rounded-full p-1.5 text-text-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-micro font-arabic text-text-muted">{fact.labelAr}</span>
                  <span
                    dir={fact.kind === 'name' || fact.kind === 'city' || fact.kind === 'job' ? 'auto' : 'rtl'}
                    className="block truncate text-xs font-arabic text-text-primary"
                  >
                    {fact.kind === 'goal' && fact.value
                      ? GOAL_COPY[fact.value as LearnerGoal]?.labelAr ?? fact.value
                      : fact.value ?? fact.placeholderAr}
                  </span>
                </span>
                <span className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => startEdit(fact)}
                    aria-label={`تعديل ${fact.labelAr}`}
                    className="rounded-full p-1.5 text-text-muted pointer-hover:text-primary transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(fact.kind)}
                    aria-label={`حذف ${fact.labelAr}`}
                    disabled={!fact.value}
                    className="rounded-full p-1.5 text-text-muted pointer-hover:text-status-error transition-colors disabled:opacity-30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
};
