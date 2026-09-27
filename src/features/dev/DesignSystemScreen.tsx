import React from 'react';
import { FloatingControl, GlassCard } from '@/components/glass/GlassCard';
import { GlassButton, PrimaryAction } from '@/components/glass/GlassButton';
import { GlassSurface, GlassWell } from '@/components/glass/GlassSurface';
import { BorderBeam } from '@/components/effects/BorderBeam';
import { SceneBackdrop } from '@/components/glass/SceneBackdrop';
import { ProgressStrip, ProgressRail } from '@/components/v2/ProgressStrip';
import { StatusIndicator } from '@/components/v2/StatusIndicator';
import { KatzuPresence } from '@/components/v2/KatzuPresence';
import { GermanText } from '@/components/common/GermanText';
import { sceneFor } from '@/lib/design/scenes';

/**
 * Phase-1 validation surface, development builds only.
 *
 * Its job is falsifiable: if the four tiers do not visibly differ over a real
 * scene, or German reorders inside Arabic, the design system is not done. It is
 * not shipped to learners — the route is registered only when `import.meta.env.DEV`.
 */
export const DesignSystemScreen: React.FC = () => {
  const warmScene = sceneFor({ id: 'cafe_order', category: 'daily_life' });
  const coolScene = sceneFor({ id: 'train_station', category: 'travel' });

  return (
    <div className="min-h-screen bg-black px-4 pb-24 pt-6">
      <h1 className="kz-ar-title mb-1 text-kz-ink">نظام تصميم كَاتْزُو V2</h1>
      <p className="kz-ar-caption mb-6 text-kz-inkFaint">صفحة تحقق داخلية — لا تُنشر للمتعلّمين.</p>

      <Section titleAr="المستويات الأربعة فوق مشهد">
        <SceneBackdrop scene={warmScene} className="rounded-squircle-lg p-4" artUrl={undefined} readability={false}>
          <div className="space-y-3">
            <GlassCard tier="canvas" className="text-kz-inkDim">
              <p className="kz-ar-caption">canvas — أخفّ طبقة، أقل ضبابية</p>
            </GlassCard>
            <GlassWell className="p-3">
              <p className="kz-ar-caption text-kz-inkDim">well — حوض غائر (تقدم، إدخال)</p>
            </GlassWell>
            <GlassCard tier="glass" className="text-kz-ink">
              <p className="kz-ar-caption">glass — اللوحة الأساسية للمحتوى</p>
            </GlassCard>
            <FloatingControl className="p-3">
              <p className="kz-ar-caption text-kz-ink">floating — أعلى طبقة، أبرز حدّ ضوئي</p>
            </FloatingControl>
          </div>
        </SceneBackdrop>
      </Section>

      <Section titleAr="التكيّف مع إضاءة المشهد">
        <div className="grid grid-cols-1 gap-3">
          {[warmScene, coolScene].map((scene) => (
            <SceneBackdrop key={scene.mood} scene={scene} className="rounded-squircle p-3" readability={false}>
              <GlassCard tier="glass">
                <p className="kz-ar-caption text-kz-ink">{scene.locationAr}</p>
                <p className="mt-1 font-german text-[0.7rem] text-kz-inkFaint">
                  scene tint: rgb({scene.keyRgb})
                </p>
              </GlassCard>
            </SceneBackdrop>
          ))}
        </div>
      </Section>

      <Section titleAr="الإجراء الأساسي والحالات">
        <PrimaryAction hintAr="سطر واحد يوضّح ما سيحدث بعد الضغط." subLabel="١٠ دقائق">
          ابدأ مهمة اليوم
        </PrimaryAction>
        <div className="mt-4 flex flex-wrap gap-2">
          <GlassButton variant="secondary">ثانوي</GlassButton>
          <GlassButton variant="quiet">اكتب بدلاً من ذلك</GlassButton>
          <GlassButton variant="earned">قدرة مكتسبة</GlassButton>
        </div>
        <BorderBeam role="active" palette="lavender" className="mt-4 p-3">
          <p className="kz-ar-caption text-kz-ink">شعاع متحرّك على عنصر نشط (lavender)</p>
        </BorderBeam>
        <BorderBeam role="active" palette="earned" className="mt-2 p-3">
          <p className="kz-ar-caption text-kz-ink">شعاع ماجنتا — للتقدّم المكتسب فقط</p>
        </BorderBeam>
        <BorderBeam role="ambient" palette="lavender" className="mt-4">
          <GlassCard tier="glass">
            <p className="kz-ar-caption text-kz-ink">نبض محيطي على زجاج في وضع الراحة</p>
          </GlassCard>
        </BorderBeam>
      </Section>

      <Section titleAr="التقدم والحالات">
        <ProgressStrip segments={5} completed={3} activeIndex={3} labelAr="الفصل الأول — ٣ من ٥" />
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

      <Section titleAr="العربية مع الألمانية">
        <GlassCard tier="glass">
          <p className="kz-ar-body mb-2 text-kz-ink">
            اسأل عن الرصيف الصحيح: العبارة <span className="font-bold">Entschuldigung</span> تفتح الحديث،
            ثم قل:
          </p>
          <GermanText className="block text-base text-kz-ink">
            Fährt dieser Zug nach München? (Straße, Größe, Käse)
          </GermanText>
          <p className="kz-ar-caption mt-2 text-kz-inkDim">هل هذا القطار متجه إلى ميونخ؟</p>
          <GermanText className="mt-3 block text-sm text-kz-inkDim">
            Der Zug fährt in 5 Minuten (Gleis 7) ab — bitte einsteigen!
          </GermanText>
        </GlassCard>
      </Section>

      <Section titleAr="حضور كَاتْزُو">
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

const Section: React.FC<{ titleAr: string; children: React.ReactNode }> = ({ titleAr, children }) => (
  <section className="mb-8">
    <h2 className="kz-ar-caption mb-3 text-kz-inkFaint">{titleAr}</h2>
    {children}
  </section>
);

export default DesignSystemScreen;
