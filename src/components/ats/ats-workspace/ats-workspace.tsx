import { useState } from "react";

import type { AtsParse } from "@/api/ats";
import { PdfPanel } from "@/components/ats/pdf-panel/pdf-panel";
import { ResultBar } from "@/components/ats/result-bar/result-bar";
import { ResultPanel } from "@/components/ats/result-panel/result-panel";
import { Separator } from "@/components/ui/separator";
import { useMoreBelow } from "@/hooks/use-more-below";

type AtsWorkspaceProps = {
  parse: AtsParse;
  /** An object URL of the visitor's file. */
  fileUrl: string | null;
  /** Show the PDF in a frame next to the result (a wide screen with a PDF viewer). */
  inlinePdf: boolean;
  /** The file isn't a PDF, so it isn't previewed. */
  pdfUnavailable?: boolean;
  onReset: () => void;
};

/** After an upload: the status across the top, then the PDF on the left and the output on the right; on phones the output comes first. */
export const AtsWorkspace = ({ parse, fileUrl, inlinePdf, pdfUnavailable, onReset }: AtsWorkspaceProps) => {
  // Focus moves to the status when the result lands, which announces it; if it didn't move, the live region does.
  const [focusKept, setFocusKept] = useState(false);
  const { scrollRef, contentRef, moreBelow } = useMoreBelow<HTMLDivElement, HTMLDivElement>();

  return (
    <div className="flex flex-col gap-6 lg:h-full">
      <ResultBar parse={parse} onReset={onReset} onFocusKept={() => setFocusKept(true)} />
      <div className="grid gap-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <div className="order-2 lg:order-0 lg:h-full">
          <PdfPanel url={fileUrl} inline={inlinePdf} unavailable={pdfUnavailable} />
        </div>
        <Separator orientation="vertical" className="hidden lg:block" />
        {/* Scrolls on its own on wide screens, so the PDF stays in view; the bottom fades while there's more below. */}
        <div
          ref={scrollRef}
          data-more-below={moreBelow || undefined}
          className="order-1 min-w-0 lg:order-0 lg:-m-1 lg:overflow-y-auto lg:scroll-pb-12 lg:p-1 lg:data-more-below:mask-[linear-gradient(to_bottom,black_calc(100%-3rem),transparent)]"
        >
          <div ref={contentRef}>
            <ResultPanel parse={parse} focusKept={focusKept} />
          </div>
        </div>
      </div>
    </div>
  );
};
