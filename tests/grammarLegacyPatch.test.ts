import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Regression for the shipped Akkusativ rule. `akkusativ_articles` used to say
 * only *der* becomes *einen* in the accusative. That is wrong twice over: the
 * definite article *der* becomes *den*, and it is the indefinite *ein* that
 * becomes *einen*. The row is applied to the live app, so a learner was taught
 * a false rule.
 */
const PATCH_PATH = 'docs/content/supplements/grammar-legacy-d4-patch.json';

interface GrammarRow {
  id: string;
  rule_de: string;
  rule_ar: string;
  explanation_ar: string;
}

function akkusativRow(): GrammarRow {
  const draft = JSON.parse(readFileSync(PATCH_PATH, 'utf8')) as { grammar: GrammarRow[] };
  const row = draft.grammar.find((g) => g.id === 'akkusativ_articles');
  if (!row) throw new Error('akkusativ_articles row is missing from the legacy patch');
  return row;
}

describe('the legacy Akkusativ grammar row', () => {
  it('teaches der → den (definite), not der → einen', () => {
    const row = akkusativRow();
    expect(row.rule_de).toMatch(/der\b.*\bden\b/);
    expect(row.rule_de).toMatch(/ein\b.*\beinen\b/);
    expect(row.rule_de).not.toMatch(/Nur der.*zu einen/);
  });

  it('keeps the Arabic rule and explanation in step with the German', () => {
    const row = akkusativRow();
    expect(row.rule_ar).toContain('den');
    expect(row.rule_ar).toContain('einen');
    expect(row.explanation_ar).toContain('den');
    expect(row.explanation_ar).toContain('einen');
  });
});
