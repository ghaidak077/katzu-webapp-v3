import React, { useSyncExternalStore } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  applyPendingUpdate,
  dismissUpdate,
  getUpdatePromptSnapshot,
  subscribeUpdatePrompt,
} from '@/lib/pwa/updatePrompt';

/**
 * One quiet bar at the bottom of the app when a new bundle is waiting.
 *
 * It is deliberately not a modal: the learner may be in the middle of a lesson,
 * and an update is never more urgent than the sentence they are typing. While a
 * conversation is live the action is disabled and the copy says why, because the
 * chat is only saved at the end of the session.
 */
export const UpdatePrompt: React.FC = () => {
  const state = useSyncExternalStore(
    subscribeUpdatePrompt,
    getUpdatePromptSnapshot,
    getUpdatePromptSnapshot,
  );

  if (!state.available || state.dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-[80] border-t border-border-strong bg-surface-raised px-4 pt-3 text-text-primary shadow-lg font-arabic"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-xl items-start gap-3">
        <span className="mt-0.5 text-primary" aria-hidden="true">
          <RefreshCw size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">تحديث متاح</p>
          <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
            {state.held
              ? 'نسخة جديدة من كاتزو جاهزة. أنهِ المحادثة الجارية أولاً حتى لا تفقد ما كتبته، ثم حدّث.'
              : 'نسخة جديدة من كاتزو جاهزة. حدّث الآن لتصل إلى آخر تحسينات الدروس.'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void applyPendingUpdate()}
              disabled={state.held || state.applying}
              className="rounded-full bg-fill px-4 py-1.5 text-xs font-bold text-on-fill transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.applying ? 'جارٍ التحديث…' : 'تحديث الآن'}
            </button>
            <button
              type="button"
              onClick={dismissUpdate}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-text-secondary"
            >
              لاحقاً
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
