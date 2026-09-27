import { describe, expect, it } from 'vitest';
import { buildShareCard, buildShareText, isShareTextSafe, sanitizeDisplayName } from '../src/lib/share/card';

describe('share card', () => {
  it('never produces a card without a recorded achievement', () => {
    expect(buildShareCard({ capabilityState: 'NOT_STARTED', scenarioTitleAr: 'عند الطبيب' })).toBeNull();
    expect(buildShareCard({ capabilityState: 'INTRODUCED', scenarioTitleAr: 'عند الطبيب' })).toBeNull();
    expect(buildShareCard({ capabilityState: 'PRACTISING', scenarioTitleAr: 'عند الطبيب' })).toBeNull();
    expect(buildShareCard({ capabilityState: 'PRACTISING' })).toBeNull();
  });

  it('builds a card from a real independent achievement', () => {
    const card = buildShareCard({
      displayName: 'غيدق',
      capabilityState: 'INDEPENDENT',
      scenarioTitleAr: 'عند الطبيب',
      independentAccuracy: 84.6,
      appUrl: 'https://katzu.app/',
    })!;
    expect(card).not.toBeNull();
    expect(card.linesAr[0]).toContain('بدون مساعدة');
    expect(card.linesAr.join(' ')).toContain('85');
    expect(buildShareText(card)).toContain('Katzu');
  });

  it('allows a streak card without a capability claim', () => {
    const card = buildShareCard({ capabilityState: 'NOT_STARTED', streakDays: 7 })!;
    expect(card).not.toBeNull();
    expect(card.linesAr.join(' ')).toContain('7');
  });

  it('keeps only a first name and drops an email-shaped name', () => {
    expect(sanitizeDisplayName('ghaid kalosh')).toBe('ghaid');
    expect(sanitizeDisplayName('learner@example.com')).toBe('learner');
    expect(sanitizeDisplayName('   ')).toBe('متعلّم كاتزو');
    expect(sanitizeDisplayName('أ'.repeat(80)).length).toBeLessThanOrEqual(24);
  });

  it('rejects share text containing an email, a level claim or a transcript', () => {
    expect(isShareTextSafe('راسلني على learner@example.com')).toBe(false);
    expect(isShareTextSafe('أنا الآن في مستوى B2')).toBe(false);
    expect(isShareTextSafe('x'.repeat(401))).toBe(false);
    expect(isShareTextSafe('أصبحت أستطيع طلب موعد بالألمانية.')).toBe(true);
  });

  it('never includes private mistakes or conversation text', () => {
    const card = buildShareCard({
      displayName: 'سارة',
      capabilityState: 'RETAINED',
      scenarioTitleAr: 'في المقهى',
      independentAccuracy: 90,
    })!;
    const text = buildShareText(card);
    expect(text).not.toMatch(/@/);
    expect(text).not.toContain('Ich ');
    expect(text).not.toMatch(/\bA1\b|\bA2\b|\bB1\b|\bB2\b/);
    expect(isShareTextSafe(text)).toBe(true);
  });
});
