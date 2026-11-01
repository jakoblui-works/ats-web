const plural = (count: number, unit: string, units: string) => `${count} ${count === 1 ? unit : units}`;

/** "2 yrs 3 mos", "1 yr", "5 mos". Nothing for 0 or no length. */
export const formatMonths = (months: number | null): string | null => {
  if (!months || months < 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years > 0 && plural(years, "yr", "yrs"), rest > 0 && plural(rest, "mo", "mos")]
    .filter(Boolean)
    .join(" ");
};

/** A date that is only a year ("2020"), so the length can only be roughly right. */
export const isYearOnly = (date: string | null): boolean => /^\d{4}$/.test(date?.trim() ?? "");
