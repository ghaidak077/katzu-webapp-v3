// Katzu welcome-back check-in: a warm, no-guilt greeting that reflects the
// user's real habit state. Persona rules: witty, self-aware, roasts German
// grammar — never the learner. Pure logic, unit-tested.
// Date handling reuses the streak helpers (local, string-based, tested).

import { localDateKey, shiftDateKey } from './streak';

export interface CheckInInput {
  lastActiveDate: string | null | undefined; // local YYYY-MM-DD ('' = first visit)
  streakDays: number;
  todayKey?: string; // injectable for tests
}

export type CheckInTone = 'first' | 'returning' | 'streak-keep' | 'welcome-back';

export interface CheckInMessage {
  tone: CheckInTone;
  headline: string; // Katzu speaking
  sub: string; // short supporting line
}

export function buildCheckInMessage(input: CheckInInput): CheckInMessage {
  const today = input.todayKey ?? localDateKey();
  const last = (input.lastActiveDate || '').trim();

  if (!last) {
    return {
      tone: 'first',
      headline: 'أهلاً! أنا كَاتْزُو — قطّك الألماني.',
      sub: 'خلّينا نبدأ أول محادثة اليوم. الألمانية أخف مما تتصور.',
    };
  }

  if (last === today) {
    return {
      tone: 'returning',
      headline: 'رجعت اليوم ثانية؟ كَاتْزُو معجب بالإصرار.',
      sub: 'دقائق قليلة الآن تعني ثقة غداً أمام الموظف الألماني.',
    };
  }

  const yesterdayKey = shiftDateKey(today, -1);

  if (last === yesterdayKey && input.streakDays > 0) {
    return {
      tone: 'streak-keep',
      headline: `سلسلتك ${input.streakDays} يوم — اليوم نكمّلها!`,
      sub: 'جلسة واحدة قصيرة تحافظ على السلسلة كما هي.',
    };
  }

  return {
    tone: 'welcome-back',
    headline: 'منور من جديد! الألمانية اشتاقت لك.',
    sub: 'القواعد ما زالت صعبة، لكنك أقوى منها. نبدأ من حيث توقفنا؟',
  };
}
