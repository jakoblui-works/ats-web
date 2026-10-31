import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PdfPanelProps = {
  /** An object URL of the visitor's own file, or `null` until it exists. */
  url: string | null;
  /** Show the PDF in a frame; otherwise just a link to open it. */
  inline: boolean;
  /** The file isn't a PDF, so there is nothing to show. */
  unavailable?: boolean;
};

const VIEWER_PARAMS = "#navpanes=0&pagemode=none&view=Fit";
const pageClassName = "min-h-0 w-full flex-1 rounded-md border";

const PdfFrame = ({ src }: { src: string }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`${pageClassName} relative overflow-hidden`}>
      <div className="absolute inset-0" aria-hidden>
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="size-6" />
        </div>
      </div>
      <iframe
        src={src}
        title="Your CV"
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 size-full bg-muted motion-safe:transition-opacity motion-safe:duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
};

/** The visitor's own PDF, from their browser's memory: nothing is fetched back from the server. */
export const PdfPanel = ({ url, inline, unavailable = false }: PdfPanelProps) => {
  if (unavailable) {
    return (
      <div className="rounded-md border bg-surface p-6 text-center text-sm text-muted-foreground">
        There is no preview for this file.
      </div>
    );
  }
  if (!inline) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-md border bg-surface p-6 text-center">
        <p className="text-sm text-muted-foreground">Open your PDF to compare it with the result.</p>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ExternalLinkIcon aria-hidden />
            Open<span className="sr-only"> your PDF</span>
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      {/* Keyed by the PDF, so a new file starts hidden again until it has loaded. */}
      {url ? (
        <PdfFrame key={url} src={`${url}${VIEWER_PARAMS}`} />
      ) : (
        <div className={`${pageClassName} relative overflow-hidden`}>
          <Skeleton className="absolute inset-0 rounded-none" />
        </div>
      )}
    </div>
  );
};
