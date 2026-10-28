const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Today as a yyyy-mm-dd string in local time (what <input type="date"> uses). */
export function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "October 18" + "2026" -> "2026-10-18"; falls back to today if the labels aren't a real date. */
export function toDateInput(dateLabel?: string | null, yearLabel?: string | null): string {
  const d = new Date(`${dateLabel ?? ''} ${yearLabel ?? ''}`);
  if (Number.isNaN(d.getTime())) return todayInput();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-10-18" -> the two labels the template prints: "October 18" and "2026". */
export function fromDateInput(value: string): { dateLabel: string; yearLabel: string } {
  const [y, m, d] = value.split('-').map(Number);
  return { dateLabel: `${MONTHS[(m ?? 1) - 1]} ${d}`, yearLabel: String(y) };
}

/** A Date -> "yyyy-mm-dd" in local time. */
export function dateToInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
