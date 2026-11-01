import { CircleCheckIcon, EyeOffIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import type { ParseResultOutput } from "@/api/generated/model";
import { cn } from "@/lib/utils";

import { formatMonths, isYearOnly } from "./format-months";

type Result = ParseResultOutput;
type Visibility = Result["visibility"];
type Warning = Result["warnings"][number];

const VERDICTS: Record<Visibility, { icon: LucideIcon; tone: string; title: string; text: string }> = {
  readable: {
    icon: CircleCheckIcon,
    tone: "text-emerald-600 dark:text-emerald-400",
    title: "A simple parser would see this",
    text: "Your CV came through as text. Check below that nothing is missing or out of place.",
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
    text: "No readable text could be found in this file. It may be a scan or an image of a page, or use a font a simple parser can't decode.",
  },
};

const WARNING_MESSAGES: Record<Warning, string> = {
  no_text_layer: "No readable text could be found. The pages may be images, or use a font a parser can't decode.",
  little_text: "Very little text could be read from the file.",
  scrambled_order:
    "The text came out in a jumbled order, which often happens with columns, tables or text boxes.",
  missing_contact: "No email address or phone number could be found.",
  missing_sections: "No experience or education heading could be found.",
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
            {result.page_count} {result.page_count === 1 ? "page" : "pages"}
            {result.visibility !== "invisible" && `, ${result.character_count} characters`}.
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
          <>
            <ul className="flex flex-col gap-2">
              {result.experience.map((job, index) => {
                const length = formatMonths(job.months);
                const about = isYearOnly(job.start) || isYearOnly(job.end);
                return (
                  <li key={index} className="flex flex-col gap-0.5 rounded-md border p-3">
                    <span className="font-medium break-words">{job.title || <Missing />}</span>
                    <span className="text-sm break-words">{job.company || <Missing />}</span>
                    <span className="text-sm text-muted-foreground">
                      {job.start || "?"} to {job.end || "?"}
                      {length && `, ${about ? "about " : ""}${length}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            {formatMonths(result.experience_months) && (
              <>
                <p className="text-sm font-medium">
                  Total: {result.experience.some((job) => isYearOnly(job.start) || isYearOnly(job.end)) && "about "}
                  {formatMonths(result.experience_months)}
                </p>
                <p className="text-sm text-muted-foreground">Jobs that overlap are counted once in the total.</p>
              </>
            )}
          </>
        ) : (
          <Missing>No jobs found</Missing>
        )}
      </Section>

      <Section title="Education">
        {result.education.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {result.education.map((entry, index) => (
              <li key={index} className="flex flex-col gap-0.5 rounded-md border p-3">
                <span className="font-medium break-words">{entry.qualification || <Missing />}</span>
                <span className="text-sm break-words">{entry.institution || <Missing />}</span>
                <span className="text-sm text-muted-foreground">
                  {entry.start || entry.end ? (
                    <>
                      {entry.start}
                      {entry.start && entry.end && entry.start !== entry.end && ` to ${entry.end}`}
                      {!entry.start && entry.end}
                    </>
                  ) : (
                    <Missing />
                  )}
                </span>
              </li>
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

      <Section title="Sections">
        {result.sections.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {result.sections.map((section, index) => (
              <li key={index} className="flex flex-col gap-1 rounded-md border p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h4 className="font-medium break-words">{section.heading}</h4>
                  <span className="text-xs text-muted-foreground">{section.kind}</span>
                </div>
                {section.text.trim() ? (
                  <p className="text-sm break-words whitespace-pre-wrap">{section.text}</p>
                ) : (
                  <Missing>No text under this heading</Missing>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Missing>No sections found</Missing>
        )}
      </Section>

      <p className="text-sm text-muted-foreground">
        Compare the text below with your PDF. If it reads in a jumbled order, a simple parser reads it that way too.
        Two-column CVs are the usual cause.
      </p>

      <details open className="rounded-md border">
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
