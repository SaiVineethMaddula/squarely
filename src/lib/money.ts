/**
 * Money helpers. All amounts are integers in paise (₹1 = 100 paise).
 * Never use floating point for stored amounts.
 */

export type Paise = number;

export function assertPaise(value: number, label = 'amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a whole number of paise, got ${value}`);
  }
}

/** Parse user input like "1,250.5" or "₹99" into paise. Returns null if invalid. */
export function parseRupees(input: string): Paise | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Format paise as Indian rupees, e.g. 125050 -> "₹1,250.5". */
export function formatINR(paise: Paise): string {
  return inr.format(paise / 100);
}
