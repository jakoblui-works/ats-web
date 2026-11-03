import type { ParseResult } from "@/parser/generated/parse-outcome";
import { TextSearch } from "@/components/ats/text-search/text-search";

import { Missing } from "./missing";

type TextTabProps = Pick<ParseResult, "sections" | "text"> & { pageCount: number; characterCount: number };

export const TextTab = ({ sections, text, pageCount, characterCount }: TextTabProps) => (
  <div className="flex flex-col gap-3">
    <p className="text-sm">
      {characterCount} characters read from {pageCount} {pageCount === 1 ? "page" : "pages"}
    </p>
    <p className="text-sm break-words">
      <span className="text-muted-foreground">Headings found: </span>
      {sections.length > 0 ? sections.map((section) => section.heading).join(", ") : <Missing>None</Missing>}
    </p>
    <p className="text-sm text-muted-foreground">
      Compare the text below with your PDF. If it reads in a jumbled order, a simple parser reads it that way too.
      Two-column CVs are the usual cause.
    </p>
    {text ? <TextSearch text={text} /> : <Missing>No text</Missing>}
  </div>
);
