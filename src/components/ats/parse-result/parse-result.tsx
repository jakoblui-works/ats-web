import { CircleCheckIcon, EyeOffIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import type { ParseResultOutput } from "@/api/generated/model";
import { cn } from "@/lib/utils";

type Result = ParseResultOutput;
type Visibility = Result["visibility"];
type Warning = Result["warnings"][number];

const VERDICTS: Record<Visibility, { icon: LucideIcon; tone: string; title: string; text: string }> = {
  readable: {
    icon: CircleCheckIcon,
    tone: "text-emerald-600 dark:text-emerald-400",
    title: "A simple parser would see this",
    text: "Your CV came through as text. Check below that nothing it found is missing or out of place.",
  },
  partial: {
    icon: TriangleAlertIcon,
    tone: "text-amber-600 dark:text-amber-400",
    title: "A simple parser would see only part of this",
    text: "Some of your CV came through as text, and some of it may be missing or in the wrong order.",
  },
  invisible: {
    icon: EyeOffIcon,
    tone: "text-destructive",
    title: "A simple parser would see nothing here",
    text: "No text could be read from this file. It may be a scan or an image of a page, which a simple parser can't read.",
  },
};

const WARNING_MESSAGES: Record<Warning, string> = {
  no_text_layer: "The file has no text layer, only images, so there is nothing to extract.",
  little_text: "Very little text could be read from the file.",
  scrambled_order:
    "The text came out in a jumbled order, which often happens with columns, tables or text boxes.",
  missing_contact: "No name or contact details could be found.",
  missing_sections:
    "No clear section headings could be found, such as experience, education or skills.",
  unparsed_dates: "Some dates could not be read.",
};

const Missing = ({ children = "Not found" }: { children?: string }) => (
  <span className="text-muted-foreground italic">{children}</span>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

const Field = ({ label, value }: { label: string; value: string | null }) => (
  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
    <dt className="w-24 shrink-0 text-sm text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words">{value || <Missing />}</dd>
  </div>
);

const dates = (start: string | null, end: string | null) =>
  start || end ? `${start ?? "?"} to ${end ?? "?"}` : null;

const Entry = ({ primary, secondary, period }: { primary: string | null; secondary: string | null; period: string | null }) => (
  <li className="flex flex-col gap-0.5 rounded-md border p-3">
    <span className="font-medium break-words">{primary || <Missing />}</span>
    <span className="break-words text-sm">{secondary || <Missing />}</span>
    <span className="text-sm text-muted-foreground">{period || <Missing>No dates found</Missing>}</span>
  </li>
);

type ParseResultProps = {
  result: Result;
  /** Called if focus was left where it was (the visitor was already somewhere), so the result needs announcing. */
  onFocusKept?: () => void;
};

export const ParseResult = ({ result, onFocusKept }: ParseResultProps) => {
  // The result replaces a working state, so keyboard and screen reader users start at the verdict.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Only when nothing has focus (the button that was pressed is gone): never take it from where the visitor is.
    const active = document.activeElement;
    if (!active || active === document.body) headingRef.current?.focus();
    else onFocusKept?.();
    // On arrival only.
  }, []);
  const verdict = VERDICTS[result.visibility];
  const Icon = verdict.icon;
  const { contact } = result;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3">
        <Icon aria-hidden className={cn("mt-0.5 size-6 shrink-0", verdict.tone)} />
        <div className="flex flex-col gap-1">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">{verdict.title}</h2>
          <p className="text-muted-foreground">{verdict.text}</p>
          <p className="text-sm text-muted-foreground">
            {result.page_count} {result.page_count === 1 ? "page" : "pages"},{" "}
            {result.character_count} characters read.
          </p>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <Section title="Things to look at">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {result.warnings.map((warning) => (
              <li key={warning}>{WARNING_MESSAGES[warning]}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Contact">
        <dl className="flex flex-col gap-2">
          <Field label="Name" value={contact.name} />
          <Field label="Email" value={contact.email} />
          <Field label="Phone" value={contact.phone} />
          <Field label="Location" value={contact.location} />
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
      </Section>

      <Section title="Experience">
        {result.experience.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {result.experience.map((item, index) => (
              <Entry
                key={index}
                primary={item.title}
                secondary={item.company}
                period={dates(item.start, item.end)}
              />
            ))}
          </ul>
        ) : (
          <Missing>No experience found</Missing>
        )}
      </Section>

      <Section title="Education">
        {result.education.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {result.education.map((item, index) => (
              <Entry
                key={index}
                primary={item.qualification}
                secondary={item.institution}
                period={dates(item.start, item.end)}
              />
            ))}
          </ul>
        ) : (
          <Missing>No education found</Missing>
        )}
      </Section>

      <Section title="Skills">
        {result.skills.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {result.skills.map((skill, index) => (
              <li key={index} className="rounded-md border bg-surface px-2 py-0.5 text-sm break-words">
                {skill}
              </li>
            ))}
          </ul>
        ) : (
          <Missing>No skills found</Missing>
        )}
      </Section>

      {result.sections.length > 0 && (
        <Section title="Section headings it found">
          <ul className="flex flex-col gap-0.5">
            {result.sections.map((section, index) => (
              <li key={index} className="break-words">
                {section.heading}{" "}
                <span className="text-sm text-muted-foreground">({section.kind})</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <details className="rounded-md border">
        <summary className="cursor-pointer p-3 text-sm font-semibold">All the text it read</summary>
        <div className="border-t p-3">
          {result.text ? (
            <pre className="max-h-96 overflow-auto font-mono text-sm break-words whitespace-pre-wrap">
              {result.text}
            </pre>
          ) : (
            <Missing>No text</Missing>
          )}
        </div>
      </details>
    </div>
  );
};
