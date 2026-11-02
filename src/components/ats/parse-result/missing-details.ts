import type { ParseResultOutput } from "@/api/generated/model";

/** The contact details a simple parser couldn't pick out. */
export const missingContact = ({ contact }: ParseResultOutput): string[] =>
  (["name", "email", "phone"] as const).filter((field) => !contact[field]);

/** Everything a simple parser couldn't pick out, in the words the status line uses. */
export const missingDetails = (result: ParseResultOutput): string[] => [
  ...missingContact(result),
  ...(result.experience.length === 0 ? ["jobs"] : []),
  ...(result.education.length === 0 ? ["education"] : []),
];
