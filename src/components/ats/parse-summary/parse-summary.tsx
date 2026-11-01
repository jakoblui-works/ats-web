import { CheckIcon, XIcon } from "lucide-react";

import type { ParseResultOutput } from "@/api/generated/model";

type Row = { label: string; found: boolean; count?: number };

/** What a simple parser picked out, derived from the result. */
export const summaryRows = (result: ParseResultOutput): Row[] => [
  { label: "Name", found: Boolean(result.contact.name) },
  { label: "Email", found: Boolean(result.contact.email) },
  { label: "Phone", found: Boolean(result.contact.phone) },
  { label: "Jobs", found: result.experience.length > 0, count: result.experience.length },
  { label: "Education", found: result.education.length > 0, count: result.education.length },
];

/** A plain checklist; each row's state is in its text, not only in its icon. */
export const ParseSummary = ({ result }: { result: ParseResultOutput }) => (
  <section className="flex flex-col gap-2" aria-labelledby="parse-summary-title">
    <h3 id="parse-summary-title" className="text-sm font-semibold">
      What it picked out
    </h3>
    <ul className="flex flex-col gap-1">
      {summaryRows(result).map(({ label, found, count }) => {
        const Icon = found ? CheckIcon : XIcon;
        return (
          <li key={label} className="flex items-center gap-2 text-sm">
            <Icon aria-hidden className={found ? "size-4 shrink-0" : "size-4 shrink-0 text-muted-foreground"} />
            <span>{label}</span>
            <span className={found ? "text-muted-foreground" : "text-muted-foreground italic"}>
              {!found ? "Not found" : count === undefined ? <span className="sr-only">Found</span> : `${count} found`}
            </span>
          </li>
        );
      })}
    </ul>
  </section>
);
