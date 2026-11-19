import { describe, expect, it } from 'vitest';
import {
  computeNetBalances,
  pairwiseDebts,
  simplifyDebts,
  type ExpenseRecord,
} from './balances';
import { computeSplit } from './splits';

// The Goa Trip example from the design doc (amounts in paise).
const goaTrip: ExpenseRecord[] = [
  // Dinner ₹3,000 paid by A, split equally between A, B, C
  { payers: { A: 300000 }, splits: computeSplit(300000, { type: 'equal', members: ['A', 'B', 'C'] }) },
  // Taxi ₹600 paid by B, split between B and C
  { payers: { B: 60000 }, splits: computeSplit(60000, { type: 'equal', members: ['B', 'C'] }) },
];

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0);

describe('computeNetBalances', () => {
  it('matches the Goa Trip example', () => {
    expect(computeNetBalances(goaTrip)).toEqual({ A: 200000, B: -70000, C: -130000 });
  });

  it('settlements move balances toward zero', () => {
    const net = computeNetBalances(goaTrip, [{ from: 'C', to: 'A', amount: 130000 }]);
    expect(net).toEqual({ A: 70000, B: -70000, C: 0 });
  });

  it('nets always sum to zero', () => {
    expect(sum(computeNetBalances(goaTrip))).toBe(0);
  });
});

describe('simplifyDebts', () => {
  it('Goa Trip: C pays A ₹1,300 and B pays A ₹700', () => {
    expect(simplifyDebts(computeNetBalances(goaTrip))).toEqual([
      { from: 'C', to: 'A', amount: 130000 },
      { from: 'B', to: 'A', amount: 70000 },
    ]);
  });

  it('returns nothing when everyone is settled', () => {
    expect(simplifyDebts({ A: 0, B: 0 })).toEqual([]);
    expect(simplifyDebts({})).toEqual([]);
  });

  it('rejects balances that do not sum to zero', () => {
    expect(() => simplifyDebts({ A: 100, B: -50 })).toThrow();
  });

  it('settles every random group in at most n-1 transfers', () => {
    // Deterministic pseudo-random generator so failures are reproducible.
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

    for (let round = 0; round < 200; round++) {
      const members = Array.from({ length: 2 + Math.floor(rand() * 8) }, (_, i) => `m${i}`);
      const expenses: ExpenseRecord[] = Array.from({ length: 1 + Math.floor(rand() * 10) }, () => {
        const total = 1 + Math.floor(rand() * 500000);
        const payer = members[Math.floor(rand() * members.length)];
        const sharing = members.filter(() => rand() > 0.3);
        return {
          payers: { [payer]: total },
          splits: computeSplit(total, {
            type: 'equal',
            members: sharing.length ? sharing : [payer],
          }),
        };
      });

      const net = computeNetBalances(expenses);
      const transfers = simplifyDebts(net);
      expect(transfers.length).toBeLessThanOrEqual(Math.max(members.length - 1, 0));

      // Applying the transfers must zero everyone out.
      const after = computeNetBalances(
        expenses,
        transfers.map((t) => ({ from: t.from, to: t.to, amount: t.amount })),
      );
      for (const v of Object.values(after)) expect(v).toBe(0);
      for (const t of transfers) expect(t.amount).toBeGreaterThan(0);
    }
  });
});

describe('pairwiseDebts', () => {
  it('Goa Trip without simplification', () => {
    expect(pairwiseDebts(goaTrip)).toEqual([
      { from: 'B', to: 'A', amount: 100000 },
      { from: 'C', to: 'A', amount: 100000 },
      { from: 'C', to: 'B', amount: 30000 },
    ]);
  });

  it('nets opposite debts between the same two people', () => {
    const expenses: ExpenseRecord[] = [
      { payers: { A: 1000 }, splits: { A: 500, B: 500 } },
      { payers: { B: 400 }, splits: { A: 200, B: 200 } },
    ];
    expect(pairwiseDebts(expenses)).toEqual([{ from: 'B', to: 'A', amount: 300 }]);
  });

  it('applies settlements', () => {
    expect(pairwiseDebts(goaTrip, [{ from: 'B', to: 'A', amount: 100000 }])).toEqual([
      { from: 'C', to: 'A', amount: 100000 },
      { from: 'C', to: 'B', amount: 30000 },
    ]);
  });
});
