/**
 * Turn an expense total plus a split description into exact per-member
 * amounts in paise. The returned amounts ALWAYS sum to the total.
 *
 * Rounding rule: compute each member's exact share, floor it, then hand the
 * leftover paise out one at a time to members with the largest remainders
 * (ties broken by the order members were given). This is deterministic, so
 * the client and the database agree.
 */
import { assertPaise, formatINR, type Paise } from './money';

export type MemberId = string;

export type SplitInput =
  | { type: 'equal'; members: MemberId[] }
  | { type: 'exact'; amounts: Record<MemberId, Paise> }
  /** Percentages may have decimals (e.g. 33.33) but must total 100. */
  | { type: 'percent'; percents: Record<MemberId, number> }
  /** Whole-number shares, e.g. { a: 2, b: 1, c: 1 }. */
  | { type: 'shares'; shares: Record<MemberId, number> };

export type SplitResult = Record<MemberId, Paise>;

export class SplitError extends Error {}

export function computeSplit(total: Paise, split: SplitInput): SplitResult {
  assertPaise(total, 'total');
  if (total <= 0) throw new SplitError('Total must be greater than zero');

  switch (split.type) {
    case 'equal': {
      const members = unique(split.members);
      if (members.length === 0) throw new SplitError('Pick at least one person');
      return distribute(total, members.map((m) => [m, 1]));
    }
    case 'exact': {
      const entries = Object.entries(split.amounts).filter(([, a]) => a !== 0);
      if (entries.length === 0) throw new SplitError('Pick at least one person');
      for (const [m, a] of entries) {
        assertPaise(a, `amount for ${m}`);
        if (a < 0) throw new SplitError('Amounts cannot be negative');
      }
      const sum = entries.reduce((s, [, a]) => s + a, 0);
      if (sum !== total) {
        throw new SplitError(`Amounts add up to ${formatINR(sum)}, expected ${formatINR(total)}`);
      }
      return Object.fromEntries(entries);
    }
    case 'percent': {
      const entries = positiveWeights(split.percents);
      // Compare in hundredths of a percent to avoid float drift (33.33 * 3 etc.)
      const totalBp = entries.reduce((s, [, p]) => s + Math.round(p * 100), 0);
      if (totalBp !== 10000) {
        throw new SplitError(`Percentages add up to ${totalBp / 100}%, expected 100%`);
      }
      return distribute(total, entries.map(([m, p]) => [m, Math.round(p * 100)]));
    }
    case 'shares': {
      const entries = positiveWeights(split.shares);
      for (const [, s] of entries) {
        if (!Number.isInteger(s)) throw new SplitError('Shares must be whole numbers');
      }
      return distribute(total, entries);
    }
  }
}

/** Split `total` proportionally to integer weights, largest-remainder rounding. */
function distribute(total: Paise, weighted: [MemberId, number][]): SplitResult {
  const weightSum = weighted.reduce((s, [, w]) => s + w, 0);
  const rows = weighted.map(([member, w], index) => {
    const exact = total * w; // numerator; share = exact / weightSum
    return {
      member,
      index,
      base: Math.floor(exact / weightSum),
      remainder: exact % weightSum,
    };
  });

  let leftover = total - rows.reduce((s, r) => s + r.base, 0);
  const byRemainder = [...rows].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  );
  for (const row of byRemainder) {
    if (leftover === 0) break;
    row.base += 1;
    leftover -= 1;
  }

  return Object.fromEntries(rows.map((r) => [r.member, r.base]));
}

function positiveWeights(weights: Record<MemberId, number>): [MemberId, number][] {
  const entries = Object.entries(weights);
  if (entries.some(([, w]) => !Number.isFinite(w) || w < 0)) {
    throw new SplitError('Values cannot be negative');
  }
  const positive = entries.filter(([, w]) => w > 0);
  if (positive.length === 0) throw new SplitError('Pick at least one person');
  return positive;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
