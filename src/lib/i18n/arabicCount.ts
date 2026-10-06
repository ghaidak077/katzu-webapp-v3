/**
 * Arabic number agreement — the one piece of grammar this app was getting wrong
 * on screen.
 *
 * Arabic does not take a fixed "plural" after a number. The form changes four
 * times, and a string that hard-codes one of them reads as machine-made to
 * every native speaker — which is the exact impression an Arabic-first product
 * cannot afford:
 *
 *   0        لا جلسات متبقية      (zero takes the plural)
 *   1        جلسة واحدة            (singular)
 *   2        جلستان                (dual — its own form, not "2 جلسة")
 *   3–10     3 جلسات               (plural)
 *   11–99   11 جلسة               (singular again, accusative)
 *   100+    100 جلسة              (singular, genitive)
 *
 * The wordings above are illustrations, not a table this module ships: Arabic
 * marks case too, so each call site supplies its own forms.
 *
 * V31 measured thirteen such strings in the product. The one that reached
 * learners most often was `راجع ${dueCount} عنصراً الآن`, which read
 * "راجع 3 عنصراً الآن" — and one shipped string dropped the noun altogether and
 * rendered "راجع 3 الآن": review three… what?
 *
 * The rule is pure and total, so it is unit-tested across the whole 0/1/2/3/10/
 * 11/100/101/103 grid rather than spot-checked at one number.
 */

/**
 * The four forms a count can take. The CALLER supplies them, because Arabic
 * marks case as well as number: the same noun is "3 عناصر" standing alone,
 * "راجع 3 عناصر" with no case to show, "راجع عنصرين" in the dual accusative
 * after a verb, and "من خطأين" in the dual genitive after a preposition. This
 * module owns only the CHOICE of form — never the wording — so each call site
 * can hand in the forms its own sentence needs.
 */
export interface ArabicCountForms {
  /** exactly 1 — typically the bare noun: "عنصر" */
  one: string;
  /** exactly 2 — the dual, in whatever case this sentence needs: "عنصران" / "عنصرين" */
  two: string;
  /** 3–10 — the plural, which is case-invariant: "عناصر" */
  few: string;
  /** 0, 11–99, 100+ — the singular again: "عنصراً" */
  many: string;
}

/**
 * Which agreement form a count takes.
 *
 * The modulus is on the last two digits, which is the rule Arabic actually
 * follows: 103 is "103 جلسات" (few) exactly as 3 is, while 111 is "111 جلسة"
 * (many) exactly as 11 is. Using `n % 100` rather than `n % 10` is what makes
 * 111 come out right.
 *
 * The 1 and 2 forms are reserved for the counts 1 and 2 themselves. Classical
 * grammar would extend them to 101 and 102 ("101 عنصر واحد", "102 عنصران"), but
 * that is not what a native writer produces — they write "101 عنصر". Where a
 * defensible rule and the natural one disagree, this takes the natural one, and
 * `tests/arabicPlural.test.ts` pins the decision rather than leaving it implied.
 */
export function arabicCountForm(n: number): keyof ArabicCountForms {
  const count = Math.abs(Math.trunc(Number.isFinite(n) ? n : 0));
  if (count === 1) return 'one';
  if (count === 2) return 'two';
  const lastTwo = count % 100;
  if (lastTwo >= 3 && lastTwo <= 10) return 'few';
  return 'many';
}

/** The noun alone, in the form this count takes: `arNoun(3, …)` → "عناصر". */
export function arNoun(count: number, forms: ArabicCountForms): string {
  return forms[arabicCountForm(count)];
}

/**
 * The count and its noun, already agreeing.
 *
 * The one and the dual are written as WORDS, not digits, and that is a rule of
 * Arabic rather than a style choice: "2 عنصرين" and "1 عنصراً" are ungrammatical
 * — you say "عنصرين" and "عنصراً واحداً". From three up the numeral is used:
 * "3 عناصر", "11 عنصراً". So `one` and `two` are returned bare (the caller
 * supplies them as the full phrase an Arabic speaker would say) and only `few`
 * and `many` take the digit in front.
 */
export function arCount(count: number, forms: ArabicCountForms): string {
  const n = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  const form = arabicCountForm(n);
  if (form === 'one' || form === 'two') return forms[form];
  return `${n} ${forms[form]}`;
}

