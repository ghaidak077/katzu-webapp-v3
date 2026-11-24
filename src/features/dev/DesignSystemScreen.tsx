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
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { UiStringKey } from '@/lib/i18n/strings';

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
 *
 * Its own labels are dictionary keys like every other screen's: the page is a
 * development tool, but a developer reading it in English should not have to
 * translate the guide to the design system.
 */
export const DesignSystemScreen: React.FC = () => {
  const { t } = useLanguage();
  const warmScene = sceneFor({ id: 'cafe_order', category: 'daily_life' });
  const coolScene = sceneFor({ id: 'train_station', category: 'travel' });

  return (
    <div className="min-h-screen bg-background px-4 pb-24 pt-6 text-text-primary">
      <h1 className="text-title">{t('dev.title')}</h1>
      <p className="mb-8 text-micro text-text-muted">
        {t('dev.subtitle')} <span className="font-german">Katzu design system</span>
      </p>

      <Section title={t('dev.section.palette.title')} subtitle={t('dev.section.palette.subtitle')}>
        <Palette />
      </Section>

      <Section title={t('dev.section.type.title')} subtitle={t('dev.section.type.subtitle')}>
        <TypeScale />
      </Section>

      <Section title={t('dev.section.radius.title')} subtitle={t('dev.section.radius.subtitle')}>
        <RadiusScale />
      </Section>

      <Section title={t('dev.section.tiers.title')} subtitle={t('dev.section.tiers.subtitle')}>
        <SceneBackdrop
          scene={warmScene}
          className="rounded-squircle-lg p-4"
          artUrl={undefined}
          readability={false}
        >
          <div className="space-y-3">
            <Card variant="subtle" className="!p-3 !text-text-secondary">
              <p className="text-caption">{t('dev.tier.canvas')}</p>
            </Card>
            <GlassWell className="p-3">
              <p className="text-caption text-text-secondary">{t('dev.tier.well')}</p>
            </GlassWell>
            <Card variant="card" className="!p-3">
              <p className="text-caption">{t('dev.tier.glass')}</p>
            </Card>
            <FloatingControl className="p-3">
              <p className="text-caption">{t('dev.tier.floating')}</p>
            </FloatingControl>
          </div>
        </SceneBackdrop>
      </Section>

      <Section title={t('dev.section.sceneTint.title')} subtitle={t('dev.section.sceneTint.subtitle')}>
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

      <Section title={t('dev.section.cards.title')} subtitle={t('dev.section.cards.subtitle')}>
        <div className="grid grid-cols-1 gap-3">
          <Card variant="subtle" className="!p-3">
            <p className="text-caption">{t('dev.card.subtle')}</p>
          </Card>
          <Card variant="card" className="!p-3">
            <p className="text-caption">{t('dev.card.card')}</p>
          </Card>
          <Card variant="hero" className="!p-3">
            <p className="text-caption">{t('dev.card.hero')}</p>
          </Card>
          <Card variant="elevated" className="!p-3">
            <p className="text-caption">{t('dev.card.elevated')}</p>
          </Card>
          <Card variant="card" emphasis="primary" className="!p-3">
            <p className="text-caption">{t('dev.card.primary')}</p>
          </Card>
          <Card variant="card" emphasis="earned" className="!p-3">
            <p className="text-caption">{t('dev.card.earned')}</p>
          </Card>
        </div>
      </Section>

      <Section title={t('dev.section.buttons.title')} subtitle={t('dev.section.buttons.subtitle')}>
        <PrimaryAction hintAr={t('dev.buttons.hint')} subLabel={t('dev.buttons.sub')}>
          {t('dev.buttons.start')}
        </PrimaryAction>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary">{t('dev.buttons.primary')}</Button>
          <Button variant="secondary">{t('dev.buttons.secondary')}</Button>
          <Button variant="outline">{t('dev.buttons.outline')}</Button>
          <Button variant="ghost">{t('dev.buttons.ghost')}</Button>
          <Button variant="quiet">{t('dev.buttons.quiet')}</Button>
          <Button variant="earned">{t('dev.buttons.earned')}</Button>
          <Button variant="danger">{t('dev.buttons.danger')}</Button>
          <Button variant="primary" isLoading>
            {t('dev.buttons.loading')}
          </Button>
          <Button variant="secondary" disabled>
            {t('dev.buttons.disabled')}
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
          <Button variant="secondary" size="icon" aria-label={t('dev.buttons.iconAria')}>
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
            {t('dev.buttons.accentOnBg')}
          </span>
        </div>

        <BorderBeam role="active" palette="lavender" className="mt-4 p-3">
          <p className="text-caption">{t('dev.beam.active')}</p>
        </BorderBeam>
        <BorderBeam role="active" palette="earned" className="mt-2 p-3">
          <p className="text-caption">{t('dev.beam.earned')}</p>
        </BorderBeam>
        <BorderBeam role="ambient" palette="lavender" className="mt-4">
          <Card variant="card" className="!p-3">
            <p className="text-caption">{t('dev.beam.ambient')}</p>
          </Card>
        </BorderBeam>
      </Section>

      <Section title={t('dev.section.progress.title')} subtitle={t('dev.section.progress.subtitle')}>
        <ProgressStrip segments={5} completed={3} activeIndex={3} labelAr={t('dev.progress.label')} />
        <div className="mt-4">
          <ProgressRail value={3} max={4} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <StatusIndicator state="online" />
          <StatusIndicator state="offline" detailAr={t('dev.status.saved')} />
          <StatusIndicator state="syncing" />
          <StatusIndicator state="cached" />
        </div>
      </Section>

      <Section title={t('dev.section.bilingual.title')} subtitle={t('dev.section.bilingual.subtitle')}>
        <Card variant="card">
          <p className="mb-2 text-body">
            {t('dev.bilingual.prefix')} <span className="font-ar">Entschuldigung</span>{' '}
            {t('dev.bilingual.suffix')}
          </p>
          <GermanText className="block font-german text-title">
            Fährt dieser Zug nach München?
          </GermanText>
          <p className="mt-2 text-caption text-text-secondary">{t('dev.bilingual.caption')}</p>
          <GermanText className="mt-3 block font-german text-caption text-text-secondary">
            Der Zug fährt in 5 Minuten (Gleis 7) ab — bitte einsteigen!
          </GermanText>
        </Card>
      </Section>

      <Section title={t('dev.section.presence.title')} subtitle={t('dev.section.presence.subtitle')}>
        <div className="flex flex-wrap items-start justify-around gap-4">
          <KatzuPresence state="journey" lineAr={t('dev.presence.journey')} size="sm" />
          <KatzuPresence state="independent" lineAr={t('dev.presence.independent')} size="sm" />
          <KatzuPresence state="assisted" lineAr={t('dev.presence.assisted')} size="sm" />
          <KatzuPresence state="incomplete" lineAr={t('dev.presence.incomplete')} size="sm" />
          <KatzuPresence state="blocked" lineAr={t('dev.presence.blocked')} size="sm" />
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
const SWATCHES: { name: string; roleKey: UiStringKey; className: string; textClass: string }[] = [
  { name: 'kz-lavender', roleKey: 'dev.swatch.lavender', className: 'bg-kz-lavender', textClass: 'text-on-lavender' },
  { name: 'kz-lavender-deep', roleKey: 'dev.swatch.fill', className: 'bg-fill', textClass: 'text-on-fill' },
  { name: 'kz-magenta', roleKey: 'dev.swatch.magenta', className: 'bg-kz-magenta', textClass: 'text-on-lavender' },
  { name: 'kz-warm', roleKey: 'dev.swatch.warm', className: 'bg-kz-warm', textClass: 'text-on-lavender' },
  { name: 'kz-amber', roleKey: 'dev.swatch.amber', className: 'bg-kz-amber', textClass: 'text-on-lavender' },
  { name: 'kz-cool', roleKey: 'dev.swatch.cool', className: 'bg-kz-cool', textClass: 'text-on-lavender' },
  { name: 'kz-neon', roleKey: 'dev.swatch.neon', className: 'bg-kz-neon', textClass: 'text-on-lavender' },
  { name: 'kz-danger', roleKey: 'dev.swatch.danger', className: 'bg-kz-danger', textClass: 'text-on-danger' },
  { name: 'kz-ink', roleKey: 'dev.swatch.ink', className: 'bg-kz-ink', textClass: 'text-background' },
  { name: 'kz-ink-dim', roleKey: 'dev.swatch.inkDim', className: 'bg-kz-inkDim', textClass: 'text-background' },
  { name: 'kz-ink-faint', roleKey: 'dev.swatch.inkFaint', className: 'bg-kz-inkFaint', textClass: 'text-background' },
  { name: 'kz-line-strong', roleKey: 'dev.swatch.lineStrong', className: 'bg-kz-lineStrong', textClass: 'text-background' },
];

const Palette: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {SWATCHES.map((s) => (
        <div key={s.name} className={cn('rounded-panel p-3', s.className, s.textClass)}>
          <p className="font-german text-micro">{s.name}</p>
          <p className="mt-1 text-micro opacity-80">{t(s.roleKey)}</p>
        </div>
      ))}
    </div>
  );
};

const TYPE_STEPS: { step: string; className: string; key: UiStringKey; de: string }[] = [
  { step: 'display', className: 'text-display', key: 'dev.type.display', de: 'Deine Reise beginnt heute' },
  { step: 'title', className: 'text-title', key: 'dev.type.title', de: 'Deine Aufgabe' },
  { step: 'body', className: 'text-body', key: 'dev.type.body', de: 'Frag nach dem Bahnhof.' },
  { step: 'caption', className: 'text-caption', key: 'dev.type.caption', de: 'Drei Minuten · A1' },
  { step: 'micro', className: 'text-micro', key: 'dev.type.micro', de: 'Automatisch übersetzt' },
];

const TypeScale: React.FC = () => {
  const { t } = useLanguage();
  return (
    <Card variant="card" className="!p-4">
      {TYPE_STEPS.map((s) => (
        <div key={s.step} className="border-b border-line/60 py-3 last:border-b-0">
          <p className="font-german text-micro text-text-muted">{s.step}</p>
          <p className={s.className}>{t(s.key)}</p>
          <p className={cn('font-german text-text-secondary', s.className)} dir="ltr">
            {s.de}
          </p>
        </div>
      ))}
    </Card>
  );
};

const RADII: { name: string; px: string; roleKey: UiStringKey }[] = [
  { name: 'rounded-tag', px: '8px', roleKey: 'dev.radius.tag' },
  { name: 'rounded-chip', px: '12px', roleKey: 'dev.radius.chip' },
  { name: 'rounded-control', px: '20px', roleKey: 'dev.radius.control' },
  { name: 'rounded-panel', px: '24px', roleKey: 'dev.radius.panel' },
  { name: 'rounded-sheet', px: '28px', roleKey: 'dev.radius.sheet' },
  { name: 'rounded-squircle-lg', px: '34px', roleKey: 'dev.radius.squircle' },
];

const RadiusScale: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {RADII.map((r) => (
        <div key={r.name} className={cn('border border-line-strong/60 bg-surface-subtle p-3', r.name)}>
          <p className="font-german text-micro text-text-primary">{r.name}</p>
          <p className="text-micro text-text-muted">
            {r.px} · {t(r.roleKey)}
          </p>
        </div>
      ))}
    </div>
  );
};

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <section className="mb-10">
    <h2 className="text-caption text-text-secondary">{title}</h2>
    {subtitle && <p className="mb-3 mt-0.5 text-micro text-text-muted">{subtitle}</p>}
    <div className={subtitle ? undefined : 'mt-3'}>{children}</div>
  </section>
);

export default DesignSystemScreen;
