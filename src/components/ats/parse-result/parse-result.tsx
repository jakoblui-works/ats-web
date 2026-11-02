import { XIcon } from "lucide-react";

import type { ParseResultOutput } from "@/api/generated/model";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ContactTab } from "./contact-tab";
import { EducationTab } from "./education-tab";
import { ExperienceTab } from "./experience-tab";
import { missingContact } from "./missing-details";
import { TextTab } from "./text-tab";

type Result = ParseResultOutput;
type Warning = Result["warnings"][number];

const PARTIAL_NOTE = "Some of your CV came through as text, and some of it may be missing or in the wrong order.";

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

const TabMissing = ({ label }: { label: string }) => (
  <>
    <XIcon aria-hidden className="text-muted-foreground" />
    <span className="sr-only">{label}</span>
  </>
);

// A pill, so the number reads as a count rather than part of the tab's name.
const TabCount = ({ count }: { count: number }) =>
  count > 0 ? (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/5 px-1.5 text-xs tabular-nums">
      {count}
    </span>
  ) : (
    <TabMissing label="none found" />
  );

/** What a simple parser picked out, for the right-hand side. */
export const ParseResult = ({ result }: { result: Result }) => {
  // A partial result has no warning of its own, and may have none at all, so its reason is always listed.
  const notes = [
    ...(result.visibility === "partial" ? [PARTIAL_NOTE] : []),
    ...result.warnings.map((warning) => WARNING_MESSAGES[warning]),
  ];

  return (
    <div className="flex flex-col gap-6">
      {notes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Things to look at</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Nothing readable came through, so there is nothing to show in the tabs. */}
      {result.visibility !== "invisible" && (
        <Tabs defaultValue="contact">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="contact">
              Contact{" "}
              {missingContact(result).length > 0 && <TabMissing label="details missing" />}
            </TabsTrigger>
            <TabsTrigger value="experience">
              Experience <TabCount count={result.experience.length} />
            </TabsTrigger>
            <TabsTrigger value="education">
              Education <TabCount count={result.education.length} />
            </TabsTrigger>
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
            <TextTab
              sections={result.sections}
              text={result.text}
              pageCount={result.page_count}
              characterCount={result.character_count}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};
