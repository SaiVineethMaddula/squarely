/**
 * Group balances and "who pays whom".
 *
 * net > 0  -> the member is owed money
 * net < 0  -> the member owes money
 * The nets of a group always sum to zero.
 */
import type { Paise } from './money';
import type { MemberId } from './splits';

export interface ExpenseRecord {
  /** Who paid, and how much each paid. Sums to the expense total. */
  payers: Record<MemberId, Paise>;
  /** Each member's share. Sums to the expense total. */
  splits: Record<MemberId, Paise>;
}

export interface SettlementRecord {
  from: MemberId;
  to: MemberId;
  amount: Paise;
}

export interface Transfer {
  from: MemberId;
  to: MemberId;
  amount: Paise;
}

export function computeNetBalances(
  expenses: ExpenseRecord[],
  settlements: SettlementRecord[] = [],
): Record<MemberId, Paise> {
  const net: Record<MemberId, Paise> = {};
  const add = (m: MemberId, delta: Paise) => {
    net[m] = (net[m] ?? 0) + delta;
  };

  for (const e of expenses) {
    for (const [m, paid] of Object.entries(e.payers)) add(m, paid);
    for (const [m, owed] of Object.entries(e.splits)) add(m, -owed);
  }
  // Paying someone back raises your balance and lowers theirs.
  for (const s of settlements) {
    add(s.from, s.amount);
    add(s.to, -s.amount);
  }
  return net;
}

/**
 * Greedy debt simplification: repeatedly match the biggest debtor with the
 * biggest creditor. Produces at most n-1 transfers. Ties are broken by
 * member id so the output is stable.
 */
export function simplifyDebts(net: Record<MemberId, Paise>): Transfer[] {
  const sum = Object.values(net).reduce((s, v) => s + v, 0);
  if (sum !== 0) throw new Error(`Balances must sum to zero, got ${sum}`);

  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([member, amount]) => ({ member, amount }));
  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([member, amount]) => ({ member, amount: -amount }));

  const byAmountThenId = (a: { member: string; amount: number }, b: typeof a) =>
    b.amount - a.amount || a.member.localeCompare(b.member);

  const transfers: Transfer[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmountThenId);
    debtors.sort(byAmountThenId);
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.amount, d.amount);

    transfers.push({ from: d.member, to: c.member, amount });
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount === 0) creditors.shift();
    if (d.amount === 0) debtors.shift();
  }
  return transfers;
}

/**
 * Pairwise (non-simplified) debts: for each expense, every member who owes a
 * share pays the payers in proportion to what they paid. Opposite debts
 * between the same two people are netted. Used when a group turns
 * "simplify debts" off.
 */
export function pairwiseDebts(
  expenses: ExpenseRecord[],
  settlements: SettlementRecord[] = [],
): Transfer[] {
  // owes[a][b] = amount a owes b
  const owes = new Map<string, number>();
  const key = (a: string, b: string) => `${a}\u0000${b}`;
  const addDebt = (from: string, to: string, amount: number) => {
    if (from === to || amount === 0) return;
    owes.set(key(from, to), (owes.get(key(from, to)) ?? 0) + amount);
  };

  for (const e of expenses) {
    const payers = Object.entries(e.payers).filter(([, p]) => p > 0);
    const paidTotal = payers.reduce((s, [, p]) => s + p, 0);
    for (const [debtor, share] of Object.entries(e.splits)) {
      // Spread this member's share across payers, largest remainder rounding.
      let assigned = 0;
      payers.forEach(([payer, paid], i) => {
        const part =
          i === payers.length - 1
            ? share - assigned
            : Math.floor((share * paid) / paidTotal);
        assigned += part;
        addDebt(debtor, payer, part);
      });
    }
  }
  for (const s of settlements) addDebt(s.to, s.from, s.amount);

  const result: Transfer[] = [];
  const seen = new Set<string>();
  for (const k of owes.keys()) {
    const [a, b] = k.split('\u0000');
    const pair = [a, b].sort().join('\u0000');
    if (seen.has(pair)) continue;
    seen.add(pair);
    const diff = (owes.get(key(a, b)) ?? 0) - (owes.get(key(b, a)) ?? 0);
    if (diff > 0) result.push({ from: a, to: b, amount: diff });
    if (diff < 0) result.push({ from: b, to: a, amount: -diff });
  }
  return result.sort(
    (x, y) => y.amount - x.amount || x.from.localeCompare(y.from),
  );
}
