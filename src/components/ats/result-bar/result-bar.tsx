import { CircleCheckIcon, EyeOffIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ParseResultOutput } from "@/api/generated/model";
import { missingDetails } from "@/components/ats/parse-result/missing-details";
import { PrivacyNote } from "@/components/ats/privacy-note/privacy-note";
import { TryAnother } from "@/components/ats/try-another/try-another";
import { cn } from "@/lib/utils";

type Status = { icon: LucideIcon; tone: string; title: string };

const WARNING_TONE = "text-amber-600 dark:text-amber-400";

const statusOf = (result: ParseResultOutput): Status => {
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
    title: "Readable by a simple parser",
  };
};

type ResultBarProps = {
  result: ParseResultOutput;
  onReset: () => void;
  /** Called if focus was left where it was (the visitor was already somewhere), so the result needs announcing. */
  onFocusKept?: () => void;
};

/** What concerns the whole page: the status, and starting again. */
export const ResultBar = ({ result, onReset, onFocusKept }: ResultBarProps) => {
  // The result replaces a working state, so keyboard and screen reader users start at the status.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Only when nothing has focus (the button that was pressed is gone): never take it from where the visitor is.
    const active = document.activeElement;
    if (!active || active === document.body) headingRef.current?.focus();
    else onFocusKept?.();
    // On arrival only.
  }, []);
  const { icon: Icon, tone, title } = statusOf(result);

  return (
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Icon aria-hidden className={cn("size-5 shrink-0", tone)} />
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
            {title}
          </h2>
        </div>
        <PrivacyNote />
      </div>
      <div className="shrink-0">
        <TryAnother onReset={onReset}>Check another CV</TryAnother>
      </div>
    </div>
  );
};
