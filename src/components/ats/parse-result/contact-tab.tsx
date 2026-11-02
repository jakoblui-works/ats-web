import type { ParseResultOutput } from "@/api/generated/model";

import { Missing } from "./missing";

const Field = ({ label, value }: { label: string; value: string | null }) => (
  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
    <dt className="w-24 shrink-0 text-sm text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words">{value || <Missing />}</dd>
  </div>
);

export const ContactTab = ({ contact }: { contact: ParseResultOutput["contact"] }) => (
  <dl className="flex flex-col gap-2">
    <Field label="Name" value={contact.name} />
    <Field label="Email" value={contact.email} />
    <Field label="Phone" value={contact.phone} />
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-24 shrink-0 text-sm text-muted-foreground">Links</dt>
      <dd className="min-w-0">
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
      </dd>
    </div>
  </dl>
);
