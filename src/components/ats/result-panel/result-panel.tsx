import { RotateCwIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { MAX_UPLOAD_BYTES, type AtsFailureReason, type AtsParse } from "@/api/ats";
import { ParseResult } from "@/components/ats/parse-result/parse-result";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

type ResultPanelProps = {
  parse: AtsParse;
  /** Back to the upload view, to try another file. */
  onReset: () => void;
};

const FAILURE_MESSAGES: Record<AtsFailureReason, string> = {
  "rate-limited": "Too many requests. Try again in a minute.",
  "too-large": `That file is too large. The limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
  "not-pdf": "That doesn't look like a PDF. Only PDF files can be checked.",
  "too-many-pages": "That PDF has too many pages. A CV should be much shorter.",
  encrypted: "That PDF is password protected, so a parser couldn't open it either.",
  corrupt: "That PDF couldn't be read. It may be damaged.",
  "timed-out": "This is taking too long. Try again, or try another file.",
  error: "Something went wrong while reading the PDF.",
};

const PrivacyNote = () => (
  <p className="text-sm">Your file is deleted right after it is parsed, and the result expires within an hour.</p>
);

/** Failures where the file was turned away before it was stored, or where the code can't know it was deleted. */
const NO_DELETION_CLAIM: AtsFailureReason[] = ["rate-limited", "too-large", "not-pdf", "error", "timed-out"];

const ANNOUNCEMENTS: Record<AtsParse["status"], string> = {
  uploading: "Uploading your CV",
  processing: "Reading your CV",
  done: "The result is ready",
  failed: "",
};

const Working = ({ label }: { label: string }) => (
  <div className="flex flex-col gap-6" aria-busy>
    <div aria-hidden className="flex items-center gap-3 text-muted-foreground">
      <Spinner aria-hidden className="size-6" />
      <p>{label}</p>
    </div>
    <div aria-hidden className="flex flex-col gap-4">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="mt-4 h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  </div>
);

const TryAnother = ({ onReset, children }: { onReset: () => void; children: ReactNode }) => (
  <Button variant="outline" onClick={onReset}>
    <RotateCwIcon aria-hidden />
    {children}
  </Button>
);

/** The right-hand side: a working state, then what a simple parser would see, or why it couldn't. */
export const ResultPanel = ({ parse, onReset }: ResultPanelProps) => {
  // Focus moves to the verdict when the result lands, which announces it; if it didn't move, the live region does.
  const [focusKept, setFocusKept] = useState(false);
  let content: ReactNode;
  if (parse.status === "uploading") {
    content = <Working label="Uploading…" />;
  } else if (parse.status === "processing") {
    content = <Working label="Reading your CV…" />;
  } else if (parse.status === "failed") {
    content = (
      <div className="flex flex-col items-center gap-4 rounded-md border p-6 text-center">
        <p role="alert" className="text-destructive">
          {FAILURE_MESSAGES[parse.reason]}
        </p>
        <TryAnother onReset={onReset}>Try another file</TryAnother>
      </div>
    );
  } else {
    content = (
      <ParseResult
        result={parse.result}
        onFocusKept={() => setFocusKept(true)}
        actions={
          <div className="flex flex-col items-start gap-3">
            <TryAnother onReset={onReset}>Check another CV</TryAnother>
            <PrivacyNote />
          </div>
        }
      />
    );
  }

  // A finished result shows the note beside its own button.
  const stored =
    parse.status === "uploading" ||
    parse.status === "processing" ||
    (parse.status === "failed" && !NO_DELETION_CLAIM.includes(parse.reason));

  return (
    <div className="flex flex-col gap-6">
      {/* One live region for every state, mounted throughout, so changes are announced. A failure
          announces itself (role="alert"). */}
      <p role="status" className="sr-only">
        {parse.status === "done" && !focusKept ? "" : ANNOUNCEMENTS[parse.status]}
      </p>
      {content}
      {stored && <PrivacyNote />}
    </div>
  );
};
