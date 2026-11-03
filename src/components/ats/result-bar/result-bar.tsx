import { CircleCheckIcon, CircleXIcon, EyeOffIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import type { AtsFailureReason, AtsParse } from "@/parser/use-ats-parse";
import type { ParseResult } from "@/parser/generated/parse-outcome";
import { missingDetails } from "@/components/ats/parse-result/missing-details";
import { PrivacyNote } from "@/components/ats/privacy-note/privacy-note";
import { TryAnother } from "@/components/ats/try-another/try-another";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** No icon means it's still working, which shows a spinner. */
type Status = { icon?: LucideIcon; tone: string; title: string; note?: string };

const WARNING_TONE = "text-amber-600 dark:text-amber-400";

/** Failures where the file was turned away before it was stored, or where the code can't know it was deleted. */
const NO_DELETION_CLAIM: AtsFailureReason[] = ["too-large", "not-pdf", "error", "timed-out"];

const verdictOf = (result: ParseResult): Status => {
  if (result.visibility === "invisible") {
    return { icon: EyeOffIcon, tone: "text-destructive", title: "Not readable by a simple parser" };
  }
  if (result.visibility === "partial") {
    return { icon: TriangleAlertIcon, tone: WARNING_TONE, title: "Only partly readable" };
  }
  const missing = missingDetails(result);
  // A readable CV with details missing isn't a pass: no green, and the line says what's missing.
  if (missing.length > 0) {
    const list = new Intl.ListFormat("en", { type: "conjunction" }).format(missing);
    return { icon: TriangleAlertIcon, tone: WARNING_TONE, title: `Readable, but missing ${list}` };
  }
  return {
    icon: CircleCheckIcon,
    tone: "text-emerald-600 dark:text-emerald-400",
    title: "A simple parser found your details",
    // Reading order is the one thing it can't check, so a pass never vouches for it.
    note: "It can't tell whether the order is right. Compare the text with your PDF.",
  };
};

const statusOf = (parse: AtsParse): Status => {
  switch (parse.status) {
    case "loading":
      return { tone: "text-muted-foreground", title: "Preparing the parser…" };
    case "processing":
      return { tone: "text-muted-foreground", title: "Reading your CV…" };
    case "failed":
      return { icon: CircleXIcon, tone: "text-destructive", title: "Couldn't check this CV" };
    case "done":
      return verdictOf(parse.result);
  }
};

type ResultBarProps = {
  parse: AtsParse;
  onReset: () => void;
  /** Called if focus was left where it was (the visitor was already somewhere), so the result needs announcing. */
  onFocusKept?: () => void;
};

/** What concerns the whole page: the status, and starting again. There from the file's choice on, so the page doesn't shift when the result lands. */
export const ResultBar = ({ parse, onReset, onFocusKept }: ResultBarProps) => {
  // The result replaces a working state, so keyboard and screen reader users start at the status.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const done = parse.status === "done";
  useEffect(() => {
    if (!done) return;
    // Only when nothing has focus (the button that was pressed is gone): never take it from where the visitor is.
    const active = document.activeElement;
    if (!active || active === document.body) headingRef.current?.focus();
    else onFocusKept?.();
    // When the result arrives only.
  }, [done]);
  const { icon: Icon, tone, title, note } = statusOf(parse);
  const stored = parse.status !== "failed" || !NO_DELETION_CLAIM.includes(parse.reason);
  // While it works, an empty line holds the place of a pass's note, so the page below doesn't move when one lands.
  const working = parse.status === "loading" || parse.status === "processing";

  return (
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          {Icon ? (
            <Icon aria-hidden className={cn("size-5 shrink-0", tone)} />
          ) : (
            <Spinner aria-hidden className={cn("size-5 shrink-0", tone)} />
          )}
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
            {title}
          </h2>
        </div>
        {note && <p className="text-sm">{note}</p>}
        {working && (
          <p aria-hidden className="text-sm">
            {"\u00a0"}
          </p>
        )}
        {stored && <PrivacyNote />}
      </div>
      <div className="shrink-0">
        <TryAnother onReset={onReset}>Check another CV</TryAnother>
      </div>
    </div>
  );
};
