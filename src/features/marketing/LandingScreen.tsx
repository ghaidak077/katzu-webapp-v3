import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { GermanText } from '@/components/common/GermanText';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getProPriceLabel, FALLBACK_PRICE_LABEL, publicAppUrl } from '@/lib/utils/links';
import { track } from '@/lib/analytics/client';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  CheckCircle2,
  Clock,
  Headphones,
  Map as MapIcon,
  MessagesSquare,
  PenLine,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';

export interface LandingScreenProps {
  /** Primary path into the product: onboarding, then account creation. */
  onStart: () => void;
  /** Existing learner: straight to sign-in. */
  onSignIn: () => void;
  /** Signed-in learner: skip the pitch and resume the Trail. */
  onContinue: () => void;
  onOpenTrustPage: (page: 'privacy' | 'terms' | 'contact') => void;
  /** Public demo: a real lesson without an account. */
  onTryDemo: () => void;
}

/**
 * The public front door.
 *
 * Before this existed, `/` redirected straight to `/app/trail` and every
 * visitor — signed in or not — was bounced into a name form. A stranger had no
 * way to learn what Katzu is, so cold traffic converted at zero. This page is
 * the only surface that explains the product before asking for an account.
 *
 * Every claim here is limited to what the app actually does today (speaking,
 * listening dictation, spaced review, error profile, placement). Reading,
 * writing and exam formats exist in the roadmap but are not built, so they are
 * listed under "قريباً" instead of marketed as shipped features — the writing
 * card here moved to "متاح الآن" in the same commit that shipped /app/write.
 */
export const LandingScreen: React.FC<LandingScreenProps> = ({
  onStart,
  onSignIn,
  onContinue,
  onOpenTrustPage,
  onTryDemo,
}) => {
  const user = useLiveQuery(() => db.users.get('current_user'));
  const isSignedIn = user?.isLoggedIn === true;

  useEffect(() => {
    track('landing_viewed', { source: isSignedIn ? 'signed_in' : 'visitor' });
    // Canonical URL: one origin, configured rather than hardcoded, so the
    // domain move (katzu.app) does not need a code change.
    const origin = publicAppUrl();
    if (!origin) return;
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${origin}/`;
    const ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
    if (ogUrl) ogUrl.content = `${origin}/`;
  }, [isSignedIn]);

  return (
    <div className="min-h-screen bg-black text-text-primary overflow-x-hidden">
      <header className="w-full border-b border-border-subtle/60 bg-black/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <KatzuMascot name="avatar" className="w-9 h-9" alt="" aria-hidden />
            <span className="font-bold text-lg tracking-tight">Katzu</span>
          </div>
          <div className="flex items-center gap-2">
            {isSignedIn ? (
              <Button size="sm" onClick={onContinue}>
                متابعة التعلّم
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={onSignIn}>
                  تسجيل الدخول
                </Button>
                <Button size="sm" onClick={onStart}>
                  ابدأ مجاناً
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5">          <Hero
          isSignedIn={isSignedIn}
          onStart={onStart}
          onSignIn={onSignIn}
          onContinue={onContinue}
          onTryDemo={onTryDemo}
        />
        <WhySection />
        <WhoItIsForSection />
        <TryDemoSection onTryDemo={onTryDemo} />
        <SkillsSection />
        <StepsSection />
        <ExampleSection />
        <FreeVsProSection onStart={onStart} isSignedIn={isSignedIn} />
        <ComingSection />
        <FaqSection />
        <FinalCta isSignedIn={isSignedIn} onStart={onStart} onContinue={onContinue} onTryDemo={onTryDemo} />
      </main>

      <Footer onOpenTrustPage={onOpenTrustPage} />
    </div>
  );
};

function Hero({
  isSignedIn,
  onStart,
  onSignIn,
  onContinue,
  onTryDemo,
}: Pick<LandingScreenProps, 'onStart' | 'onSignIn' | 'onContinue' | 'onTryDemo'> & { isSignedIn: boolean }) {
  return (
    <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24">
      <div className="absolute top-0 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 w-[28rem] h-[28rem] bg-primary/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex flex-col items-center text-center">
        <Badge variant="primary" size="md">
          <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden />
          عربي أولاً · ألمانية الحياة اليومية
        </Badge>

        <h1 className="mt-6 text-3xl sm:text-5xl font-bold leading-[1.25] tracking-tight max-w-3xl">
          تحدّث الألمانية التي تحتاجها فعلاً
          <span className="block mt-2 text-primary">لا كلمات تحفظها وتنساها</span>
        </h1>

        <p className="mt-5 text-sm sm:text-lg text-text-secondary leading-relaxed max-w-2xl px-2">
          كاتزو تطبيق عربي لتعلّم الألمانية من <span className="text-text-primary font-semibold">A1 إلى B2</span>:
          تتدرّب على مواقف حقيقية في ألمانيا — التسجيل في البلدية، المواعيد، التأمين، العمل — وتتحدّث
          بصوت عالٍ كل يوم، وكاتزو يتذكّر أخطاءك ويعيدها عليك في الوقت المناسب.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto px-2">
          {isSignedIn ? (
            <Button size="lg" className="w-full sm:w-auto" onClick={onContinue}>
              <MapIcon className="w-5 h-5" aria-hidden />
              متابعة رحلتك
            </Button>
          ) : (
            <Button size="lg" className="w-full sm:w-auto" onClick={onStart}>
              ابدأ مجاناً الآن
              <ArrowLeft className="w-5 h-5" aria-hidden />
            </Button>
          )}
          {!isSignedIn && (
            <>
              <Button size="lg" variant="outline" className="w-full sm:w-auto" onClick={onTryDemo}>
                جرّب درساً بدون حساب
              </Button>
              <Button size="lg" variant="ghost" className="w-full sm:w-auto" onClick={onSignIn}>
                لديّ حساب
              </Button>
            </>
          )}
        </div>

        <div className="mt-10 flex items-center justify-center gap-6 sm:gap-10">
          <KatzuMascot name="welcome" glow className="w-40 h-40 sm:w-56 sm:h-56" />
        </div>

        {/* V21 Phase 8: the owner's video slot. The video is NOT shipped yet —
            the placeholder states that honestly and the slot activates with no
            code change once katzu_hero_video.mp4 lands in /public/videos (the
            component checks the file's HTTP status, not a build-time flag). */}
        <VideoSlot />

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-caption text-text-secondary">
          {['يتحدّث بصوت عالٍ', 'يستمع ويملي', 'يتذكّر أخطاءك', 'يعرف مستواك من البداية'].map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const REASONS = [
  {
    icon: Brain,
    title: 'يتذكّر ما تنساه',
    body: 'كل كلمة تدرسها، وكل خطأ تصحّحه، يدخل قائمة مراجعة ذكية تُعيده عليك في اللحظة التي كنت ستصدأ فيها — لا مرة واحدة ثم نسيان.',
  },
  {
    icon: MessagesSquare,
    title: 'تتكلّم، لا تختار فقط',
    body: 'شريك محادثة صبور لا يسخر منك، مع شرح بالعربية بعد كل جملة: لماذا كانت صحيحة، وما الخطأ الذي كررته.',
  },
  {
    icon: ShieldCheck,
    title: 'تقدّم صادق',
    body: 'لا أرقام مزيّفة. نُفرّق بين الجملة التي كتبتها بنفسك والجملة التي ساعدتك فيها التلميحات، ونقول لك أيهما تتقنه فعلاً.',
  },
] as const;

/**
 * V21 Phase 8: the video slot. Renders nothing until /videos/katzu_hero_video.mp4
 * actually exists — the check is a HEAD request at mount, so dropping the file
 * into /public/videos activates the slot with no code change, and an absent or
 * failing video leaves the page exactly as it was (no broken player, no layout
 * shift). Controls on, no autoplay: a visitor chooses to watch.
 */
function VideoSlot() {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/videos/katzu_hero_video.mp4', { method: 'HEAD' })
      .then((res) => {
        if (alive && res.ok) setSrc('/videos/katzu_hero_video.mp4');
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!src) return null;
  return (
    <div className="mt-10 w-full max-w-2xl mx-auto rounded-3xl overflow-hidden border border-border-subtle bg-surface-card">
      <video src={src} controls preload="none" playsInline className="w-full aspect-video" aria-label="فيديو تعريفي عن تطبيق كاتزو">
        <track kind="captions" />
      </video>
    </div>
  );
}

/** V21 Phase 8: who this is for — four honest portraits, no aspirational fluff. */
const WHO_IT_IS_FOR = [
  {
    icon: MapIcon,
    title: 'المتقدّم إلى ألمانيا',
    body: 'التسجيل، البلدية، التأمين، أول شقة — مواقف ستمر بها فعلاً، تتدرّب عليها قبل أن تقف فيها.',
  },
  {
    icon: MessagesSquare,
    title: 'طالب Berufsschule أو الجامعة',
    body: 'تفهّم المدرّب وزملاءك، وتتكلّم في المجموعة دون أن تتجمّد عندما يسألك أحد مباشرة.',
  },
  {
    icon: Target,
    title: 'الباحث عن تدريب مهني أو عمل',
    body: 'مقابلات قصيرة بجمل واضحة: خبرتك، نقاط قوّتك، ولماذا هذا المؤسّس بالذات — بمستويين لكل سؤال.',
  },
  {
    icon: Clock,
    title: 'من جرّب تطبيقات كثيرة وملّ',
    body: 'لا نقاط ولا إشعارات مُلحّة. مهمة واحدة قصيرة يومياً، وتقدّم تقوله لك الحقيقة.',
  },
] as const;

function WhoItIsForSection() {
  return (
    <section className="py-14 sm:py-20 border-t border-border-subtle/60">
      <SectionHeading
        eyebrow="لمن هذا التطبيق"
        title="صُمّم لأربع حالات، بصراحة"
        subtitle="إن لم تجد حالتك هنا فربما لم نبنِ ما تحتاج بعد — ونُفضّل أن نقول ذلك بدل أن نعدك بكل شيء."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {WHO_IT_IS_FOR.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-3xl p-5 bg-surface-subtle border border-border-subtle">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" aria-hidden />
              </div>
              <h3 className="font-bold">{title}</h3>
            </div>
            <p className="mt-3 text-caption leading-relaxed text-text-secondary">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** V21 Phase 8: the FAQ — objections answered plainly, collapse-free (details
    elements are native, keyboard-accessible, and print-friendly). */
const FAQ_ITEMS = [
  {
    q: 'هل أحتاج حساباً لأجرّب؟',
    a: 'لا. الدرس التجريبي يعمل بلا حساب وبلا بطاقة، وبعدها فقط يُطلب منك حساب مجاني يحفظ تقدّمك.',
  },
  {
    q: 'هل صوتي يُرسل إلى أي جهة؟',
    a: 'الصوت يُعالج لتحويل الكلام إلى نص فقط، ولا يُخزَّن بعد ذلك. محادثاتك وأخطاؤك تبقى على جهازك وتُزامَن مع حسابك، ويمكنك حذف كل شيء من داخل التطبيق.',
  },
  {
    q: 'ما الفرق بين المجاني و Pro؟',
    a: 'المجاني دائم: المهمة اليومية، والمراجعة، والاختبار التحديدي، وبنك أخطائك، و٣ جلسات محادثة مجانية. Pro يفتح المحادثات بلا حدّ وكل المستويات. لن نُغلق أمامك ما تعلّمته بالفعل أبداً.',
  },
  {
    q: 'هل يصل بي إلى مستوى الامتحان؟',
    a: 'التطبيق يبني الأساس من A0 إلى B2 بالمحادثة والاستماع والمراجعة. تدريب صيغ الامتحانات الكاملة (Goethe · telc · DTZ) قيد العمل ويُطلق فقط عندما يكون قابلاً للقياس.',
  },
  {
    q: 'أنا مبتدئ تماماً — من أين أبدأ؟',
    a: 'يوجد مسار كامل من الصفر (A0): التحيات، السوبرماركت، البنك، أول قطار. الاختبار التحديدي سيعرف مستواك في دقائق، ويمكنك دائماً اختيار «ابدأ من الصفر» بنفسك.',
  },
  {
    q: 'كيف أدفع؟ وهل هناك اشتراك تلقائي؟',
    a: 'تُشترى كود تفعيل من صفحة الشراء الرسمية بالعملة الرقمية أو بالدفع المحلي في سوريا، ثم تُفعّله داخل التطبيق. لا تجديد تلقائي ولا بطاقة محفوظة.',
  },
] as const;

function FaqSection() {
  return (
    <section className="py-14 sm:py-20 border-t border-border-subtle/60">
      <SectionHeading
        eyebrow="أسئلة صريحة"
        title="أسئلة يسألها الجميع"
        subtitle="إن بقي سؤال، راسلنا — نُجيب بأنفسنا لا بروبوت."
      />
      <div className="mt-10 max-w-3xl mx-auto space-y-3">
        {FAQ_ITEMS.map(({ q, a }) => (
          <details key={q} className="group rounded-2xl bg-surface-card border border-border-subtle open:border-primary/30">
            <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer text-sm font-bold font-arabic select-none [&::-webkit-details-marker]:hidden">
              {q}
              <span className="text-primary text-lg leading-none group-open:rotate-45 transition-transform" aria-hidden>
                +
              </span>
            </summary>
            <p className="px-4 pb-4 text-caption leading-relaxed text-text-secondary font-arabic">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function WhySection() {
  return (
    <section className="py-14 sm:py-20 border-t border-border-subtle/60">
      <SectionHeading
        eyebrow="لماذا كاتزو"
        title="رفيق يومي، لا درس تُنسى نهايته"
        subtitle="تطبيقات كثيرة تُعلّمك كلمة مرة واحدة. الفرق أن كاتزو يبني عادة يومية قصيرة حولها."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {REASONS.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="group rounded-3xl p-5 bg-surface-card border border-border-subtle pointer-hover:border-primary/40 pointer-hover:-translate-y-0.5 transition-[color,background-color,border-color,transform]"
          >
            <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" aria-hidden />
            </div>
            <h3 className="mt-4 font-bold">{title}</h3>
            <p className="mt-2 text-caption leading-relaxed text-text-secondary">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The value-before-signup band. A visitor can complete one real lesson —
 * study, check, speak, feedback — and only then be asked for an account. The
 * four bullets describe what the demo actually does; the same list is rendered
 * inside /demo, so the promise and the product cannot drift.
 */
function TryDemoSection({ onTryDemo }: Pick<LandingScreenProps, 'onTryDemo'>) {
  return (
    <section className="py-14 sm:py-20 border-t border-border-subtle/60">
      <SectionHeading
        eyebrow="جرّب قبل أن تسجّل"
        title="درس واحد حقيقي، بدون حساب"
        subtitle="لا نطلب بريداً ولا بطاقة ولا إذن إشعارات. تدرّب على موقف واحد، وقرّر بعدها إن كان كاتزو يستحق حسابك."
      />
      <div className="mt-10 rounded-3xl p-6 sm:p-8 bg-surface-card border border-primary/30 max-w-3xl mx-auto">
        <ol className="grid gap-4 sm:grid-cols-2">
          {[
            { icon: BookOpen, text: 'تتعلّم عبارة ومفردة من مشهد واقعي — بمحتوى التطبيق الحقيقي لا بنص تجريبي.' },
            { icon: Target, text: 'تجيب على سؤالين قصيرين للتأكد أنك فهمت المعنى.' },
            { icon: MessagesSquare, text: 'تُنتج جملة ألمانية بنفسك — كتابةً أو بصوتك — وتأخذ تصحيحاً بالعربية.' },
            { icon: Brain, text: 'تُنشأ لك بطاقة مراجعة من التجربة، وتنتقل معك إلى حسابك لاحقاً.' },
          ].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <Icon className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
              <span className="text-caption leading-relaxed text-text-secondary">{text}</span>
            </li>
          ))}
        </ol>
        <div className="mt-7 flex flex-col sm:flex-row items-center gap-3">
          <Button size="lg" className="w-full sm:w-auto min-w-[14rem]" onClick={onTryDemo}>
            ابدأ التجربة المجانية
            <ArrowLeft className="w-5 h-5" aria-hidden />
          </Button>
          <span className="text-micro text-text-muted">تعمل أيضاً بدون اتصال بعد أول زيارة</span>
        </div>
      </div>
    </section>
  );
}

/**
 * What is free and what Pro unlocks — stated plainly, before any paywall.
 *
 * The free column is deliberately concrete (daily mission, review, placement,
 * first conversations) because a learner who hits the wall later must not feel
 * the rules changed. Nothing in onboarding, the demo, or reviewing already
 * learned content is behind Pro.
 */
function FreeVsProSection({ onStart, isSignedIn }: { onStart: () => void; isSignedIn: boolean }) {
  const [priceLabel, setPriceLabel] = useState(FALLBACK_PRICE_LABEL);

  useEffect(() => {
    let alive = true;
    getProPriceLabel().then((label) => {
      if (alive) setPriceLabel(label);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="py-14 sm:py-20 border-t border-border-subtle/60">
      <SectionHeading
        eyebrow="الأسعار بصراحة"
        title="ما هو مجاني، وما يفتحه Pro"
        subtitle="الكود يُشترى من صفحة الشراء الرسمية ثم يُفعَّل داخل التطبيق. لا دفع داخل التطبيق ولا اشتراك تلقائي مفاجئ."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 max-w-3xl mx-auto">
        <div className="rounded-3xl p-6 bg-surface-subtle border border-border-subtle">
          <Badge variant="subtle" size="md">
            مجاناً دائماً
          </Badge>
          <ul className="mt-5 space-y-3 text-caption text-text-secondary">
            {[
              'الدرس التجريبي بدون حساب، ثم حساب مجاني يحفظ تقدّمك.',
              'المهمة اليومية والمراجعة الذكية لكل ما تعلّمته مجاناً.',
              'الاختبار التحديدي وبنك الأخطاء وتقرير الأداء.',
              '٣ جلسات محادثة مجانية (يمكنك دائماً كتابة الرد إذا تعذّر الصوت)، والمراجعة والمهمة اليومية بلا حدّ.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-status-success shrink-0 mt-0.5" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl p-6 bg-gradient-to-br from-surface-hero to-surface-card border border-primary/30">
          <Badge variant="primary" size="md">
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            Katzu Pro — {priceLabel}
          </Badge>
          <ul className="mt-5 space-y-3 text-caption text-text-secondary">
            {[
              'محادثات غير محدودة مع كاتزو بعد انتهاء الجلسات التجريبية.',
              'كل المستويات والمشاهد من A1 إلى B2.',
              'توليد تلميحات إضافية وتغيير الصعوبة أثناء المحادثة.',
              'بنك مراجعة موسّع لا يتوقف عند حدّ الجلسات المجانية.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-micro text-text-muted leading-relaxed">
            يمكنك دائماً إكمال ما بدأته والمراجعة بلا حدود — لن نُغلق أمامك ما تعلّمته بالفعل.
          </p>
          <Button size="md" className="mt-4 w-full" onClick={onStart}>
            {isSignedIn ? 'افتح صفحة Pro' : 'ابدأ مجاناً ثم رقِّ لاحقاً'}
          </Button>
        </div>
      </div>
    </section>
  );
}

const SKILLS = [
  {
    icon: MessagesSquare,
    label: 'Sprechen',
    ar: 'المحادثة',
    body: 'محادثة حقيقية مع كاتزو في مواقف فعلية، مع تصحيح فوري بالعربية.',
    ready: true,
  },
  {
    icon: Headphones,
    label: 'Hören',
    ar: 'الاستماع',
    body: 'تدريب إملاء: تسمع الجملة الألمانية ثم تكتبها، وتُصحّح لك كلمة بكلمة.',
    ready: true,
  },
  {
    icon: BookOpen,
    label: 'Lesen',
    ar: 'القراءة',
    body: 'نصوص قصيرة بمستواك مع معنى أي كلمة بلمسة واحدة.',
    ready: false,
  },
  {
    icon: PenLine,
    label: 'Schreiben',
    ar: 'الكتابة',
    body: 'مهام كتابة بصيغة الامتحان (رسالة، طلب موعد، بريد رسمي، شكوى) مع تقييم من أربعة معايير وتصحيح مفصّل، وكل خطأ يعود إليك في المراجعة.',
    ready: true,
  },
] as const;

function SkillsSection() {
  return (
    <section className="py-14 sm:py-20 border-t border-border-subtle/60">
      <SectionHeading
        eyebrow="منهج كامل"
        title="المهارات الأربع، لا مهارة واحدة"
        subtitle="كل اختبار ألماني حقيقي يقيس الاستماع والقراءة والكتابة والمحادثة. نبني المنهج على الأربع بالترتيب الصحيح."
      />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SKILLS.map(({ icon: Icon, label, ar, body, ready }) => (
          <div key={label} className="rounded-3xl p-5 bg-surface-subtle border border-border-subtle">
            <div className="flex items-start justify-between gap-2">
              <Icon className="w-5 h-5 text-primary shrink-0" aria-hidden />
              <Badge variant={ready ? 'success' : 'subtle'} size="sm">
                {ready ? 'متاح الآن' : 'قريباً'}
              </Badge>
            </div>
            <GermanText as="div" className="mt-4 text-base font-bold">
              {label}
            </GermanText>
            <p className="mt-1 text-xs font-arabic text-text-muted">{ar}</p>
            <p className="mt-2.5 text-caption leading-relaxed text-text-secondary">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  {
    icon: Target,
    title: 'يعرف مستواك في ٣ دقائق',
    body: 'اختبار قصير يتكيّف مع إجاباتك، فيبدأ من مستواك الحقيقي بدل أن يُعيد عليك الأساسيات.',
  },
  {
    icon: MessagesSquare,
    title: 'مشهد واحد كل يوم',
    body: 'مفهوم جديد، ثم تدريب، ثم محادثة حقيقية في المكان نفسه — بمواقف ستقف فيها فعلاً في ألمانيا.',
  },
  {
    icon: Clock,
    title: 'مراجعة ذكية تعيد الخطأ',
    body: 'ما أخطأت فيه يعود إليك في اليوم التالي ثم بعد أسبوع ثم بعد شهر، حتى يصبح تلقائياً.',
  },
] as const;

function StepsSection() {
  return (
    <section className="py-14 sm:py-20 border-t border-border-subtle/60">
      <SectionHeading eyebrow="كيف يعمل" title="حلقة يومية قصيرة" subtitle="من خمس إلى عشر دقائق يومياً تكفي لبناء عادة تبقى." />
      <ol className="mt-10 grid gap-4 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="rounded-3xl p-5 bg-surface-card border border-border-subtle">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-bold flex items-center justify-center">
                {index + 1}
              </span>
              <Icon className="w-5 h-5 text-primary" aria-hidden />
            </div>
            <h3 className="mt-4 font-bold">{title}</h3>
            <p className="mt-2 text-caption leading-relaxed text-text-secondary">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const EXAMPLE_MISTAKES = [
  {
    wrong: 'Ich habe 25 Jahre.',
    right: 'Ich bin 25 Jahre alt.',
    why: 'العمر في الألمانية بفعل sein لا haben — «أنا ٢٥ سنة» لا «عندي ٢٥ سنة».',
  },
  {
    wrong: 'Ich gehe nach Arzt.',
    right: 'Ich gehe zum Arzt.',
    why: 'مع الأشخاص والأماكن نستخدم zu + Dativ، فتصبح nach Arzt ← zum Arzt.',
  },
  {
    wrong: 'Ich wohne in der Berlin.',
    right: 'Ich wohne in Berlin.',
    why: 'أسماء المدن تأتي بدون أداة تعريف: in Berlin، لا in der Berlin.',
  },
] as const;

function ExampleSection() {
  return (
    <section className="py-14 sm:py-20 border-t border-border-subtle/60">
      <SectionHeading
        eyebrow="من داخل التطبيق"
        title="أخطاء حقيقية يصحّحها كاتزو"
        subtitle="هذه أمثلة فعلية من أخطاء الناطقين بالعربية في الألمانية، وكل خطأ تدخله قائمة مراجعتك تلقائياً."
      />
      <div className="mt-10 space-y-3">
        {EXAMPLE_MISTAKES.map(({ wrong, right, why }) => (
          <div key={wrong} className="rounded-3xl p-5 bg-surface-card border border-border-subtle">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                <Badge variant="error" size="sm" className="mt-0.5 shrink-0">
                  خطأ
                </Badge>
                <GermanText className="text-sm text-text-secondary line-through decoration-status-error/60">
                  {wrong}
                </GermanText>
              </div>
              <div className="flex items-start gap-2.5">
                <Badge variant="success" size="sm" className="mt-0.5 shrink-0">
                  صحيح
                </Badge>
                <GermanText className="text-sm font-semibold text-text-primary">{right}</GermanText>
              </div>
            </div>
            <p className="mt-3 pt-3 border-t border-border-subtle text-caption leading-relaxed text-text-secondary">
              {why}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComingSection() {
  return (
    <section className="py-14 sm:py-20 border-t border-border-subtle/60">
      <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-surface-hero to-surface-card border border-primary/30">
        <Badge variant="learning" size="md">
          <Clock className="w-3.5 h-3.5" aria-hidden />
          قريباً
        </Badge>
        <h2 className="mt-4 text-xl sm:text-2xl font-bold">الطريق إلى الشهادة</h2>
        <p className="mt-3 text-caption sm:text-sm leading-relaxed text-text-secondary max-w-2xl">
          نعمل حالياً على القراءة وتدريب صيغة مهام الامتحان الكاملة والتصحيح الزمني
          (<GermanText className="text-xs">Goethe</GermanText> · <GermanText className="text-xs">telc</GermanText> ·{' '}
          <GermanText className="text-xs">DTZ</GermanText> من A1 إلى B2) ليصبح كاتزو تحضيراً صادقاً للشهادة، لا لعبة.
          نُطلقها فقط عندما تكون جاهزة وقابلة للقياس.
        </p>
        <ul className="mt-5 grid gap-2 sm:grid-cols-3 text-caption text-text-secondary">
          <li className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary shrink-0" aria-hidden />
            نصوص قراءة متدرّجة
          </li>
          <li className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary shrink-0" aria-hidden />
            محاكاة امتحان بتوقيت حقيقي
          </li>
          <li className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary shrink-0" aria-hidden />
            تدريب على مهام الامتحان
          </li>
        </ul>
      </div>
    </section>
  );
}

function FinalCta({
  isSignedIn,
  onStart,
  onContinue,
  onTryDemo,
}: Pick<LandingScreenProps, 'onStart' | 'onContinue' | 'onTryDemo'> & { isSignedIn: boolean }) {
  return (
    <section className="py-14 sm:py-20 border-t border-border-subtle/60">
      <div className="flex flex-col items-center text-center">
        <KatzuMascot name="thumbs_up" className="w-28 h-28" />
        <h2 className="mt-5 text-2xl sm:text-3xl font-bold">ابدأ اليوم بخمس دقائق</h2>
        <p className="mt-3 text-sm text-text-secondary max-w-xl leading-relaxed">
          أنشئ حسابك، سنعرف مستواك في دقائق، وستتحدّث الألمانية من الجلسة الأولى.
        </p>
        <Button
          size="lg"
          className="mt-7 w-full sm:w-auto min-w-[15rem]"
          onClick={isSignedIn ? onContinue : onStart}
        >
          {isSignedIn ? 'متابعة رحلتك' : 'ابدأ مجاناً الآن'}
          <ArrowLeft className="w-5 h-5" aria-hidden />
        </Button>
        {!isSignedIn && (
          <Button size="md" variant="outline" className="mt-3 w-full sm:w-auto min-w-[15rem]" onClick={onTryDemo}>
            أو جرّب درساً كاملاً بدون حساب
          </Button>
        )}
      </div>
    </section>
  );
}

function Footer({ onOpenTrustPage }: Pick<LandingScreenProps, 'onOpenTrustPage'>) {
  return (
    <footer className="border-t border-border-subtle/60 mt-4">
      <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <KatzuMascot name="badge" className="w-8 h-8" alt="" aria-hidden />
          <span className="text-sm text-text-muted">Katzu — رفيقك لتعلم الألمانية</span>
        </div>
        <nav className="flex items-center gap-5 text-caption text-text-secondary">
          <button type="button" className="pointer-hover:text-primary transition-colors" onClick={() => onOpenTrustPage('privacy')}>
            الخصوصية
          </button>
          <button type="button" className="pointer-hover:text-primary transition-colors" onClick={() => onOpenTrustPage('terms')}>
            الشروط
          </button>
          <button type="button" className="pointer-hover:text-primary transition-colors" onClick={() => onOpenTrustPage('contact')}>
            تواصل معنا
          </button>
        </nav>
      </div>
    </footer>
  );
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <p className="text-xs font-semibold text-primary tracking-wide">{eyebrow}</p>
      <h2 className="mt-2.5 text-2xl sm:text-3xl font-bold tracking-tight">{title}</h2>
      <p className="mt-3 text-caption sm:text-sm text-text-secondary leading-relaxed">{subtitle}</p>
    </div>
  );
}
