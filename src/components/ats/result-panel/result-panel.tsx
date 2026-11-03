import type { ReactNode } from "react";

import { MAX_FILE_BYTES, type AtsFailureReason, type AtsParse } from "@/parser/use-ats-parse";
import { ParseResult } from "@/components/ats/parse-result/parse-result";
import { Skeleton } from "@/components/ui/skeleton";

type ResultPanelProps = {
  parse: AtsParse;
  /** The result landed without focus moving to it, so the live region has to announce it. */
  focusKept?: boolean;
};

const FAILURE_MESSAGES: Record<AtsFailureReason, string> = {
  "too-large": `That file is too large. The limit is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
  "not-pdf": "That doesn't look like a PDF. Only PDF files can be checked.",
  "too-many-pages": "That PDF has too many pages. A CV should be much shorter.",
  encrypted: "That PDF is password protected, so a parser couldn't open it either.",
  corrupt: "That PDF couldn't be read. It may be damaged.",
  "timed-out": "This is taking too long. Try again, or try another file.",
  error: "Something went wrong while reading the PDF.",
};

const ANNOUNCEMENTS: Record<AtsParse["status"], string> = {
  loading: "Preparing the parser",
  processing: "Reading your CV",
  done: "The result is ready",
  failed: "",
};

/** The bar above says what it's doing; this holds the place of the result. */
const Working = () => (
  <div aria-busy>
    {/* On the page, not in a box: light mode's muted is the page's grey, so they take cv-web's page-level tone. */}
    <div aria-hidden className="flex flex-col gap-4 *:bg-input/60 dark:*:bg-muted">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="mt-4 h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  </div>
);

/** The right-hand side: a working state, then what a simple parser would see, or why it couldn't. */
export const ResultPanel = ({ parse, focusKept = false }: ResultPanelProps) => {
  let content: ReactNode;
  if (parse.status === "loading" || parse.status === "processing") {
    content = <Working />;
  } else if (parse.status === "failed") {
    // "Check another CV" in the bar above is the way back.
    content = (
      <div className="rounded-md border bg-surface p-6 text-center">
        <p role="alert" className="text-destructive">
          {FAILURE_MESSAGES[parse.reason]}
        </p>
      </div>
    );
  } else {
    content = <ParseResult result={parse.result} />;
  }

  return (
    // The page's state, for checks that run the built site: `data-reason` only when it failed.
    <div
      className="flex flex-col gap-6"
      data-state={parse.status}
      data-reason={parse.status === "failed" ? parse.reason : undefined}
    >
      {/* One live region for every state, mounted throughout, so changes are announced. A failure
          announces itself (role="alert"). */}
      <p role="status" className="sr-only">
        {parse.status === "done" && !focusKept ? "" : ANNOUNCEMENTS[parse.status]}
      </p>
      {content}
    </div>
  );
};
