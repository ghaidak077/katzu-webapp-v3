import React from 'react';
import { Button, PrimaryAction } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FloatingControl } from '@/components/glass/GlassCard';
import { GlassWell } from '@/components/glass/GlassSurface';
import { BorderBeam } from '@/components/effects/BorderBeam';
import { SceneBackdrop } from '@/components/glass/SceneBackdrop';
import { ProgressStrip, ProgressRail } from '@/components/v2/ProgressStrip';
import { StatusIndicator } from '@/components/v2/StatusIndicator';
import { KatzuPresence } from '@/components/v2/KatzuPresence';
import { GermanText } from '@/components/common/GermanText';
import { cn } from '@/lib/cn';
import { sceneFor } from '@/lib/design/scenes';

/**
 * The living style guide, development builds only. The route is registered
 * only when `import.meta.env.DEV`.
 *
 * Its job is falsifiable. Every claim the rest of the app relies on has a
 * visible counterexample somewhere on this page:
 *
 *   · the four glass tiers must be *distinguishable* over a real scene, not
 *     four shades of the same grey;
 *   · the five-step type scale must be monotone and must not collide;
 *   · the named radii must be visibly different from each other;
 *   · a filled button's label must be legible, which is why the accent role
 *     (`primary`) and the fill role (`fill`) are separate tokens.
 *
 * If any of those look wrong here, the system is wrong everywhere.
 */
export const DesignSystemScreen: React.FC = () => {
  const warmScene = sceneFor({ id: 'cafe_order', category: 'daily_life' });
  const coolScene = sceneFor({ id: 'train_station', category: 'travel' });

  return (
    <div className="min-h-screen bg-background px-4 pb-24 pt-6 text-text-primary">
      <h1 className="text-title">نظام تصميم كَاتْزُو</h1>
      <p className="mb-8 text-micro text-text-muted">
        صفحة تحقق داخلية — لا تُنشر للمتعلّمين · <span className="font-german">Katzu design system</span>
      </p>

      <Section titleAr="اللوحة الواحدة" subtitle="كل لون يأتي من src/index.css">
        <Palette />
      </Section>

      <Section titleAr="سلّم الكتابة" subtitle="خمس درجات، خطّان، بلا استثناءات">
        <TypeScale />
      </Section>

      <Section titleAr="استدارة الزوايا" subtitle="الاسم يقول الدور، لا الرقم">
        <RadiusScale />
      </Section>

      <Section titleAr="المستويات الأربعة فوق مشهد" subtitle="canvas → well → glass → floating">
        <SceneBackdrop
          scene={warmScene}
          className="rounded-squircle-lg p-4"
          artUrl={undefined}
          readability={false}
        >
          <div className="space-y-3">
            <Card variant="subtle" className="!p-3 !text-text-secondary">
              <p className="text-caption">canvas — أخفّ طبقة، أقل ضبابية</p>
            </Card>
            <GlassWell className="p-3">
              <p className="text-caption text-text-secondary">well — حوض غائر (تقدم، إدخال)</p>
            </GlassWell>
            <Card variant="card" className="!p-3">
              <p className="text-caption">glass — اللوحة الأساسية للمحتوى</p>
            </Card>
            <FloatingControl className="p-3">
              <p className="text-caption">floating — أعلى طبقة، أبرز حدّ ضوئي</p>
            </FloatingControl>
          </div>
        </SceneBackdrop>
      </Section>

      <Section titleAr="التكيّف مع إضاءة المشهد" subtitle="لون واحد، إضاءة مختلفة">
        <div className="grid grid-cols-1 gap-3">
          {[warmScene, coolScene].map((scene) => (
            <SceneBackdrop
              key={scene.mood}
              scene={scene}
              className="rounded-squircle p-3"
              readability={false}
            >
              <Card variant="card" className="!p-3">
                <p className="text-caption">{scene.locationAr}</p>
                <p className="mt-1 font-german text-micro text-text-muted">
                  scene tint: rgb({scene.keyRgb})
                </p>
              </Card>
            </SceneBackdrop>
          ))}
        </div>
      </Section>

      <Section titleAr="لوحات المحتوى" subtitle="variant = العمق · emphasis = الأهمية">
        <div className="grid grid-cols-1 gap-3">
          <Card variant="subtle" className="!p-3">
            <p className="text-caption">subtle — يتراجع حتى لا يزاحم المحتوى</p>
          </Card>
          <Card variant="card" className="!p-3">
            <p className="text-caption">card — اللوحة الافتراضية</p>
          </Card>
          <Card variant="hero" className="!p-3">
            <p className="text-caption">hero — بحدّ بنفسجي، لعنوان الشاشة</p>
          </Card>
          <Card variant="elevated" className="!p-3">
            <p className="text-caption">elevated — يطفو فوق التخطيط</p>
          </Card>
          <Card variant="card" emphasis="primary" className="!p-3">
            <p className="text-caption">emphasis primary — الإجراء المتوقّع، وحدّ مضيء</p>
          </Card>
          <Card variant="card" emphasis="earned" className="!p-3">
            <p className="text-caption">emphasis earned — الماجنتا تعني “سجّلها التطبيق” فقط</p>
          </Card>
        </div>
      </Section>

      <Section titleAr="الإجراء الأساسي والحالات" subtitle="إجراء أساسي واحد لكل شاشة">
        <PrimaryAction hintAr="سطر واحد يوضّح ما سيحدث بعد الضغط." subLabel="10 دقائق">
          ابدأ مهمة اليوم
        </PrimaryAction>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary">أساسي</Button>
          <Button variant="secondary">ثانوي</Button>
          <Button variant="outline">محدَّد</Button>
          <Button variant="ghost">شبح</Button>
          <Button variant="quiet">اكتب بدلاً من ذلك</Button>
          <Button variant="earned">قدرة مكتسبة</Button>
          <Button variant="danger">احذف</Button>
          <Button variant="primary" isLoading>
            جارٍ
          </Button>
          <Button variant="secondary" disabled>
            غير متاح
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Button variant="secondary" size="sm">
            sm · 44
          </Button>
          <Button variant="secondary" size="md">
            md · 48
          </Button>
          <Button variant="secondary" size="lg">
            lg · 56
          </Button>
          <Button variant="secondary" size="icon" aria-label="رمز فقط">
            ✦
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-control bg-fill px-4 py-2 text-caption text-on-fill">
            fill + on-fill · 4.5:1
          </span>
          <span className="rounded-control bg-primary px-4 py-2 text-caption text-on-lavender">
            primary + on-lavender
          </span>
          <span className="rounded-control bg-primary px-4 py-2 text-caption">
            accent على الخلفية
          </span>
        </div>

        <BorderBeam role="active" palette="lavender" className="mt-4 p-3">
          <p className="text-caption">شعاع متحرّك على عنصر نشط (lavender)</p>
        </BorderBeam>
        <BorderBeam role="active" palette="earned" className="mt-2 p-3">
          <p className="text-caption">شعاع ماجنتا — للتقدّم المكتسب فقط</p>
        </BorderBeam>
        <BorderBeam role="ambient" palette="lavender" className="mt-4">
          <Card variant="card" className="!p-3">
            <p className="text-caption">نبض محيطي على زجاج في وضع الراحة</p>
          </Card>
        </BorderBeam>
      </Section>

      <Section titleAr="التقدم والحالات" subtitle="الحالة لا تُقال بالنص وحده">
        <ProgressStrip segments={5} completed={3} activeIndex={3} labelAr="الفصل الأول — 3 من 5" />
        <div className="mt-4">
          <ProgressRail value={3} max={4} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <StatusIndicator state="online" />
          <StatusIndicator state="offline" detailAr="المهمة محفوظة" />
          <StatusIndicator state="syncing" />
          <StatusIndicator state="cached" />
        </div>
      </Section>

      <Section titleAr="العربية مع الألمانية" subtitle="كل لغة بخطّها، بدرجتها">
        <Card variant="card">
          <p className="mb-2 text-body">
            اسأل عن الرصيف الصحيح: العبارة <span className="font-ar">Entschuldigung</span> تفتح الحديث،
            ثم قل:
          </p>
          <GermanText className="block font-german text-title">
            Fährt dieser Zug nach München?
          </GermanText>
          <p className="mt-2 text-caption text-text-secondary">هل هذا القطار متجه إلى ميونخ؟</p>
          <GermanText className="mt-3 block font-german text-caption text-text-secondary">
            Der Zug fährt in 5 Minuten (Gleis 7) ab — bitte einsteigen!
          </GermanText>
        </Card>
      </Section>

      <Section titleAr="حضور كَاتْزُو" subtitle="لغة واحدة لكل الحالات">
        <div className="flex flex-wrap items-start justify-around gap-4">
          <KatzuPresence state="journey" lineAr="مهمة اليوم" size="sm" />
          <KatzuPresence state="independent" lineAr="أنجزتها وحدك" size="sm" />
          <KatzuPresence state="assisted" lineAr="أنجزتها بمساعدة" size="sm" />
          <KatzuPresence state="incomplete" lineAr="لم تكتمل" size="sm" />
          <KatzuPresence state="blocked" lineAr="بدون اتصال" size="sm" />
        </div>
      </Section>
    </div>
  );
};

/**
 * The palette, rendered from the token names. `swatch` deliberately has no
 * colour in this file's JSX — the colour comes from the `bg-*` class, which
 * resolves to a CSS variable in `src/index.css`. If a token stops existing,
 * Tailwind drops the class and the swatch turns transparent, which is the
 * failure this page is meant to make visible.
 */
const SWATCHES: { name: string; role: string; className: string; textClass: string }[] = [
  { name: 'kz-lavender', role: 'accent · نص وأيقونات وحدود', className: 'bg-kz-lavender', textClass: 'text-on-lavender' },
  { name: 'kz-lavender-deep', role: 'fill · خلفية زر صلب', className: 'bg-fill', textClass: 'text-on-fill' },
  { name: 'kz-magenta', role: 'earned · تقدّم مسجَّل فقط', className: 'bg-kz-magenta', textClass: 'text-on-lavender' },
  { name: 'kz-warm', role: 'accent دافئ', className: 'bg-kz-warm', textClass: 'text-on-lavender' },
  { name: 'kz-amber', role: 'تحذير لطيف', className: 'bg-kz-amber', textClass: 'text-on-lavender' },
  { name: 'kz-cool', role: 'معلومة', className: 'bg-kz-cool', textClass: 'text-on-lavender' },
  { name: 'kz-neon', role: 'نجاح', className: 'bg-kz-neon', textClass: 'text-on-lavender' },
  { name: 'kz-danger', role: 'خطأ', className: 'bg-kz-danger', textClass: 'text-on-danger' },
  { name: 'kz-ink', role: 'نص أساسي', className: 'bg-kz-ink', textClass: 'text-background' },
  { name: 'kz-ink-dim', role: 'نص ثانوي', className: 'bg-kz-inkDim', textClass: 'text-background' },
  { name: 'kz-ink-faint', role: 'نص خافت — 4.68:1', className: 'bg-kz-inkFaint', textClass: 'text-background' },
  { name: 'kz-line-strong', role: 'حدّ يلمسه الإصبع', className: 'bg-kz-lineStrong', textClass: 'text-background' },
];

const Palette: React.FC = () => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {SWATCHES.map((s) => (
      <div key={s.name} className={cn('rounded-panel p-3', s.className, s.textClass)}>
        <p className="font-german text-micro">{s.name}</p>
        <p className="mt-1 text-micro opacity-80">{s.role}</p>
      </div>
    ))}
  </div>
);

const TYPE_STEPS = [
  { step: 'display', className: 'text-display', ar: 'ابدأ رحلتك اليوم', de: 'Deine Reise beginnt heute' },
  { step: 'title', className: 'text-title', ar: 'مهمة اليوم', de: 'Deine Aufgabe' },
  { step: 'body', className: 'text-body', ar: 'اسأل عن المحطة قبل أن تصعد.', de: 'Frag nach dem Bahnhof.' },
  { step: 'caption', className: 'text-caption', ar: 'ثلاث دقائق · مستوى A1', de: 'Drei Minuten · A1' },
  { step: 'micro', className: 'text-micro', ar: 'مترجم آلياً', de: 'Automatisch übersetzt' },
];

const TypeScale: React.FC = () => (
  <Card variant="card" className="!p-4">
    {TYPE_STEPS.map((s) => (
      <div key={s.step} className="border-b border-line/60 py-3 last:border-b-0">
        <p className="font-german text-micro text-text-muted">{s.step}</p>
        <p className={s.className}>{s.ar}</p>
        <p className={cn('font-german text-text-secondary', s.className)} dir="ltr">
          {s.de}
        </p>
      </div>
    ))}
  </Card>
);

const RADII = [
  { name: 'rounded-tag', px: '8px', role: 'تظليل كلمة واحدة' },
  { name: 'rounded-chip', px: '12px', role: 'شارة صغيرة' },
  { name: 'rounded-control', px: '20px', role: 'زر، حقل إدخال' },
  { name: 'rounded-panel', px: '24px', role: 'لوحة محتوى' },
  { name: 'rounded-sheet', px: '28px', role: 'ورقة منزلقة من الأسفل' },
  { name: 'rounded-squircle-lg', px: '34px', role: 'مشهد كامل العرض' },
];

const RadiusScale: React.FC = () => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {RADII.map((r) => (
      <div key={r.name} className={cn('border border-line-strong/60 bg-surface-subtle p-3', r.name)}>
        <p className="font-german text-micro text-text-primary">{r.name}</p>
        <p className="text-micro text-text-muted">
          {r.px} · {r.role}
        </p>
      </div>
    ))}
  </div>
);

const Section: React.FC<{ titleAr: string; subtitle?: string; children: React.ReactNode }> = ({
  titleAr,
  subtitle,
  children,
}) => (
  <section className="mb-10">
    <h2 className="text-caption text-text-secondary">{titleAr}</h2>
    {subtitle && <p className="mb-3 mt-0.5 text-micro text-text-muted">{subtitle}</p>}
    <div className={subtitle ? undefined : 'mt-3'}>{children}</div>
  </section>
);

export default DesignSystemScreen;
