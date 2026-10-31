import type { AtsParse } from "@/api/ats";
import { PdfPanel } from "@/components/ats/pdf-panel/pdf-panel";
import { ResultPanel } from "@/components/ats/result-panel/result-panel";
import { Separator } from "@/components/ui/separator";

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

/** After an upload: the PDF on the left and the output on the right; on phones the output comes first. */
export const AtsWorkspace = ({ parse, fileUrl, inlinePdf, pdfUnavailable, onReset }: AtsWorkspaceProps) => (
  <div className="grid gap-8 lg:h-full lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
    <div className="order-2 lg:order-0 lg:h-full">
      <PdfPanel url={fileUrl} inline={inlinePdf} unavailable={pdfUnavailable} />
    </div>
    <Separator orientation="vertical" className="hidden lg:block" />
    <div className="order-1 lg:order-0 lg:-m-1 lg:overflow-y-auto lg:p-1">
      <ResultPanel parse={parse} onReset={onReset} />
    </div>
  </div>
);
