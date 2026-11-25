import { describe, expect, it } from 'vitest';
import {
  GRAMMAR_TITLES,
  MOCK_PARTS,
  SCENARIO_TITLES,
  UNIT_TITLES,
  grammarTitle,
  mockPartBrief,
  mockPartTitle,
  scenarioTitle,
  unitTitle,
} from '@/lib/content/titles';

const ARABIC = /[\u0600-\u06FF]/;

describe('content titles', () => {
  it('ships a hand-written English and Indonesian title for every entry', () => {
    const tables: Array<[string, Record<string, { en: string; id: string }>]> = [
      ['scenario', SCENARIO_TITLES],
      ['unit', UNIT_TITLES],
      ['grammar', GRAMMAR_TITLES],
    ];
    for (const [label, table] of tables) {
      for (const [id, title] of Object.entries(table)) {
        expect(title.en.trim(), `${label} ${id} en`).not.toBe('');
        expect(title.id.trim(), `${label} ${id} id`).not.toBe('');
        expect(ARABIC.test(title.en), `${label} ${id} en is not Arabic`).toBe(false);
        expect(ARABIC.test(title.id), `${label} ${id} id is not Arabic`).toBe(false);
        expect(title.en, `${label} ${id} en differs from id`).not.toBe(title.id);
      }
    }
  });

  it('resolves the row title per language and keeps Arabic byte-identical', () => {
    const row = { id: 'sc_wohnen', title_ar: 'السكن', title_en: 'Housing', title_id: 'Tempat tinggal' };
    expect(scenarioTitle(row, 'ar')).toBe('السكن');
    expect(scenarioTitle(row, 'en')).toBe('Housing');
    expect(scenarioTitle(row, 'id')).toBe('Tempat tinggal');
  });

  it('prefers a title column the content load brought with it', () => {
    const id = Object.keys(SCENARIO_TITLES)[0];
    const row = { id, title_ar: 'السكن', title_en: 'Renting a flat' };
    expect(scenarioTitle(row, 'en')).toBe('Renting a flat');
    // Indonesian is missing on the row, so the client table answers.
    expect(scenarioTitle(row, 'id')).toBe(SCENARIO_TITLES[id].id);
  });

  it('falls back to the Arabic title for ids it does not know', () => {
    const row = { id: 'sc_unknown', title_ar: 'عنوان' };
    expect(scenarioTitle(row, 'en')).toBe('عنوان');
    expect(unitTitle({ unit: 99, title_ar: 'وحدة' }, 'id')).toBe('وحدة');
    expect(grammarTitle({ id: 'g_unknown', title_ar: 'قاعدة' }, 'en')).toBe('قاعدة');
  });

  it('localizes the mock exam parts by id', () => {
    for (const [id, part] of Object.entries(MOCK_PARTS)) {
      expect(part.title.en).not.toBe('');
      expect(part.brief.id).not.toBe('');
      expect(mockPartTitle({ id, titleAr: 'عربي' }, 'en')).toBe(part.title.en);
      expect(mockPartBrief({ id, briefAr: 'عربي' }, 'id')).toBe(part.brief.id);
      expect(mockPartTitle({ id, titleAr: 'عربي' }, 'ar')).toBe('عربي');
    }
  });
});
