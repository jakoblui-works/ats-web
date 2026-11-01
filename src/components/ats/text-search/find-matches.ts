export type Match = { start: number; end: number };

export const MAX_TERM_LENGTH = 100;
export const MAX_MATCHES = 500;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whole-word, case-insensitive matches of one term in a text. Whitespace in the term matches any run of
 * whitespace in the text (so a line break counts as a space). "Whole word" means no letter or digit directly
 * before or after, rather than `\b`, which fails after symbols such as `#` and `+`.
 */
export const findMatches = (text: string, term: string): Match[] => {
  const words = term.trim().slice(0, MAX_TERM_LENGTH).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const pattern = words.map(escape).join("\\s+");
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "giu");
  const matches: Match[] = [];
  for (const found of text.matchAll(regex)) {
    matches.push({ start: found.index, end: found.index + found[0].length });
    if (matches.length >= MAX_MATCHES) break;
  }
  return matches;
};
