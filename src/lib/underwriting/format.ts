export function formatCurrency(value: number, opts: { cents?: boolean } = {}): string {
  if (!isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  if (!isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}
