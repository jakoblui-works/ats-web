import { CircleCheckIcon, EyeOffIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ParseResultOutput } from "@/api/generated/model";
import { ParseSummary, summaryRows } from "@/components/ats/parse-summary/parse-summary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { ContactTab } from "./contact-tab";
import { EducationTab } from "./education-tab";
import { ExperienceTab } from "./experience-tab";
import { TextTab } from "./text-tab";

type Result = ParseResultOutput;
type Visibility = Result["visibility"];
type Warning = Result["warnings"][number];

const VERDICTS: Record<Visibility, { icon: LucideIcon; tone: string; title: string; text: string }> = {
  readable: {
    icon: CircleCheckIcon,
    tone: "text-muted-foreground",
    title: "A simple parser can read this text",
    text: "Its text came through. Here's what a simple parser picked out of it.",
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

// The open panel is a keyboard stop, so it needs a visible focus style.
const TAB_PANEL = "rounded-md pt-2 text-base focus-visible:ring-[3px] focus-visible:ring-ring/50";

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
  const allFound = summaryRows(result).every((row) => row.found);
  const base = VERDICTS[result.visibility];
  // A readable CV with details missing isn't a pass: no green, and the line says so.
  const verdict =
    result.visibility !== "readable"
      ? base
      : allFound
        ? {
            ...base,
            tone: "text-emerald-600 dark:text-emerald-400",
            text: "Its text came through, and a simple parser picked out all of the details below.",
          }
        : { ...base, text: "Its text came through, but some details weren't picked out. See the list below." };
  const Icon = verdict.icon;

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

      {result.visibility !== "invisible" && <ParseSummary result={result} />}

      {result.warnings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Things to look at</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {result.warnings.map((warning) => (
              <li key={warning}>{WARNING_MESSAGES[warning]}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Nothing readable came through, so there is nothing to show in the tabs. */}
      {result.visibility !== "invisible" && (
        <Tabs defaultValue="contact">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="experience">Experience ({result.experience.length})</TabsTrigger>
            <TabsTrigger value="education">Education ({result.education.length})</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
          </TabsList>
          <TabsContent value="contact" className={TAB_PANEL}>
            <ContactTab contact={result.contact} />
          </TabsContent>
          <TabsContent value="experience" className={TAB_PANEL}>
            <ExperienceTab experience={result.experience} experience_months={result.experience_months} />
          </TabsContent>
          <TabsContent value="education" className={TAB_PANEL}>
            <EducationTab education={result.education} />
          </TabsContent>
          {/* Stays mounted so a search survives a look at another tab. */}
          <TabsContent value="text" keepMounted className={TAB_PANEL}>
            <TextTab sections={result.sections} text={result.text} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};
