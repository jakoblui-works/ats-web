import { CheckIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { ParseResult } from "@/parser/generated/parse-outcome";

import { Missing } from "./missing";

const LABEL = "flex h-6 w-24 shrink-0 items-center gap-1.5 self-start text-sm text-muted-foreground";

const Field = ({ label, value }: { label: string; value: string | null }) => {
  const Icon = value ? CheckIcon : XIcon;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className={LABEL}>
        <Icon aria-hidden className={value ? "size-4 shrink-0 text-foreground" : "size-4 shrink-0"} />
        {label}
      </dt>
      <dd className="min-w-0 break-words">{value || <Missing />}</dd>
    </div>
  );
};

/** An optional detail, so no mark; the gap keeps the labels aligned. */
const UnmarkedField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
    <dt className={LABEL}>
      <span aria-hidden className="size-4 shrink-0" />
      {label}
    </dt>
    <dd className="min-w-0 break-words">{children}</dd>
  </div>
);

export const ContactTab = ({ contact }: { contact: ParseResult["contact"] }) => (
  <dl className="flex flex-col gap-2">
    <Field label="Name" value={contact.name} />
    <Field label="Email" value={contact.email} />
    <Field label="Phone" value={contact.phone} />
    <UnmarkedField label="Location">{contact.location || <Missing />}</UnmarkedField>
    <UnmarkedField label="Links">
      {contact.links.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {contact.links.map((link, index) => (
            <li key={index} className="break-all">
              {link}
            </li>
          ))}
        </ul>
      ) : (
        <Missing />
      )}
    </UnmarkedField>
  </dl>
);
