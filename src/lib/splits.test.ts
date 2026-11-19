import { describe, expect, it } from 'vitest';
import { computeSplit, SplitError } from './splits';
import { formatINR, parseRupees } from './money';

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0);

describe('equal split', () => {
  it('splits evenly when divisible', () => {
    expect(computeSplit(300000, { type: 'equal', members: ['a', 'b', 'c'] })).toEqual({
      a: 100000,
      b: 100000,
      c: 100000,
    });
  });

  it('₹100 three ways gives 3334 + 3333 + 3333, first member gets the extra paisa', () => {
    const r = computeSplit(10000, { type: 'equal', members: ['a', 'b', 'c'] });
    expect(r).toEqual({ a: 3334, b: 3333, c: 3333 });
    expect(sum(r)).toBe(10000);
  });

  it('ignores duplicate members', () => {
    expect(computeSplit(1000, { type: 'equal', members: ['a', 'a', 'b'] })).toEqual({
      a: 500,
      b: 500,
    });
  });

  it('rejects an empty member list', () => {
    expect(() => computeSplit(1000, { type: 'equal', members: [] })).toThrow(SplitError);
  });
});

describe('exact split', () => {
  it('accepts amounts that add up', () => {
    expect(computeSplit(1000, { type: 'exact', amounts: { a: 700, b: 300 } })).toEqual({
      a: 700,
      b: 300,
    });
  });

  it('rejects amounts that do not add up', () => {
    expect(() => computeSplit(1000, { type: 'exact', amounts: { a: 700, b: 200 } })).toThrow(
      /add up to ₹9, expected ₹10/,
    );
  });

  it('rejects fractional paise', () => {
    expect(() => computeSplit(1000, { type: 'exact', amounts: { a: 999.5, b: 0.5 } })).toThrow();
  });
});

describe('percent split', () => {
  it('handles 33.33 / 33.33 / 33.34', () => {
    const r = computeSplit(10000, {
      type: 'percent',
      percents: { a: 33.33, b: 33.33, c: 33.34 },
    });
    expect(sum(r)).toBe(10000);
    expect(r).toEqual({ a: 3333, b: 3333, c: 3334 });
  });

  it('rejects percentages that do not total 100', () => {
    expect(() =>
      computeSplit(10000, { type: 'percent', percents: { a: 50, b: 40 } }),
    ).toThrow(/90%/);
  });
});

describe('shares split', () => {
  it('splits 2:1:1', () => {
    expect(
      computeSplit(100000, { type: 'shares', shares: { a: 2, b: 1, c: 1 } }),
    ).toEqual({ a: 50000, b: 25000, c: 25000 });
  });

  it('always sums to the total with awkward numbers', () => {
    for (let total = 1; total <= 2000; total += 37) {
      const r = computeSplit(total, { type: 'shares', shares: { a: 3, b: 5, c: 7 } });
      expect(sum(r)).toBe(total);
    }
  });

  it('rejects fractional shares', () => {
    expect(() => computeSplit(1000, { type: 'shares', shares: { a: 1.5, b: 1 } })).toThrow();
  });
});

describe('totals', () => {
  it('rejects zero, negative and fractional totals', () => {
    const split = { type: 'equal' as const, members: ['a'] };
    expect(() => computeSplit(0, split)).toThrow();
    expect(() => computeSplit(-100, split)).toThrow();
    expect(() => computeSplit(10.5, split)).toThrow();
  });
});

describe('money helpers', () => {
  it('parses rupee input into paise', () => {
    expect(parseRupees('1,250.5')).toBe(125050);
    expect(parseRupees('₹99')).toBe(9900);
    expect(parseRupees('0.07')).toBe(7);
    expect(parseRupees('12.345')).toBeNull();
    expect(parseRupees('abc')).toBeNull();
    expect(parseRupees('-5')).toBeNull();
  });

  it('formats paise in Indian style', () => {
    expect(formatINR(12345600)).toBe('₹1,23,456');
    expect(formatINR(125050)).toBe('₹1,250.5');
  });
});
