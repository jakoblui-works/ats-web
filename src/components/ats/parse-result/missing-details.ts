import type { ParseResult } from "@/parser/generated/parse-outcome";

/** The contact details a simple parser couldn't pick out. */
export const missingContact = ({ contact }: ParseResult): string[] =>
  (["name", "email", "phone"] as const).filter((field) => !contact[field]);

/** Everything a simple parser couldn't pick out, in the words the status line uses. */
export const missingDetails = (result: ParseResult): string[] => [
  ...missingContact(result),
  ...(result.experience.length === 0 ? ["jobs"] : []),
  ...(result.education.length === 0 ? ["education"] : []),
];
