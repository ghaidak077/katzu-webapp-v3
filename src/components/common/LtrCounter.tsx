/**
 * A "n / m" counter that cannot flip in RTL.
 *
 * WHY THIS EXISTS (launch-week G2): the Review header interpolated
 * `{index + 1} / {queue.length}` into an RTL document. The "/" is
 * direction-neutral, so the bidi algorithm rendered the line as
 * "3 / 1" for "1 / 3" — the learner on item 1 of 3 read it as item 3 of 1.
 *
 * THE FIX: a `<bdi dir="ltr">` span isolates the whole run from the RTL
 * context, so "1 / 3" is painted exactly left-to-right wherever it appears.
 * Numbers keep their Western digits (the numeral rule, `westernNumerals.test.ts`).
 */
import React from 'react';

export const LtrCounter: React.FC<{ value: number | string; total: number | string; className?: string }> = ({
  value,
  total,
  className,
}) => (
  <bdi dir="ltr" className={className}>
    {value} / {total}
  </bdi>
);
