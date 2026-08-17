const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftIsoDate(value: string, days: number): string {
  if (!ISO_DATE.test(value)) throw new Error("Date must use YYYY-MM-DD format");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

export function latestFinalSearchConsoleDate(now = new Date()): string {
  const pacificDate = dateInTimeZone(now, "America/Los_Angeles");
  return shiftIsoDate(pacificDate, -3);
}

export function expectedDateRange(endDate: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 489) {
    throw new Error("Date range must contain between 1 and 489 days");
  }

  return Array.from({ length: count }, (_, index) =>
    shiftIsoDate(endDate, index - count + 1),
  );
}
