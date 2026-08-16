/**
 * Sums an array of currency amount strings (as returned by Drizzle's
 * `numeric` columns) without floating-point drift, by converting each to
 * integer cents before summing and dividing back at the end.
 */
export function sumAmounts(amounts: (string | number)[]): number {
  const totalCents = amounts.reduce<number>((cents, a) => {
    const n = typeof a === "string" ? Number(a) : a;
    return cents + Math.round(n * 100);
  }, 0);
  return totalCents / 100;
}
