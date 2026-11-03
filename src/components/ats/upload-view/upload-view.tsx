import { LockIcon, UploadIcon } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";

import { ParseResult } from "@/components/ats/parse-result/parse-result";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { exampleResult } from "./example-result";

/** An invented CV in `public/`, read like an upload, with one job a simple parser can't name. */
const SAMPLE_CV = "/sample-cv.pdf";

type UploadViewProps = {
  /** Called with the chosen or dropped file. */
  onFile: (file: File) => void;
  /** A file is being dragged over the page (handled at page level, see `useWindowFileDrop`). */
  dragging?: boolean;
  /** Focus the button on mount, for coming back from a result. */
  focusButton?: boolean;
};

/**
 * The page before an upload, and the site's first screen: what it is in a line, a drop area holding the page's only
 * primary button, and a sample CV to try. Wide screens also get an example result beside it.
 */
export const UploadView = ({ onFile, dragging = false, focusButton = false }: UploadViewProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusButton) buttonRef.current?.focus();
  }, [focusButton]);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same file again still counts as a change.
    event.target.value = "";
    if (file) onFile(file);
  };

  // The sample's request, so a second click waits for it, and leaving the view (another file chosen) cancels it.
  const sampleRequest = useRef<AbortController | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  useEffect(() => () => sampleRequest.current?.abort(), []);

  // A link, so it opens the PDF without JavaScript, and a modified click opens it as a link would.
  const trySample = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (sampleRequest.current) return;
    const request = new AbortController();
    sampleRequest.current = request;
    setLoadingSample(true);
    try {
      const response = await fetch(SAMPLE_CV, { signal: request.signal });
      if (!response.ok) throw new Error(`The sample answered ${response.status}`);
      const pdf = await response.blob();
      if (!request.signal.aborted) onFile(new File([pdf], "sample-cv.pdf", { type: "application/pdf" }));
    } catch {
      // Whatever went wrong, the link still works as a link.
      if (!request.signal.aborted) window.location.assign(SAMPLE_CV);
    } finally {
      sampleRequest.current = null;
      if (!request.signal.aborted) setLoadingSample(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold text-balance sm:text-4xl">Would a simple ATS read your CV?</h1>
        <p className="text-lg text-balance text-foreground/75 dark:text-muted-foreground">
          Upload your CV and see what a deliberately simple parser picks out: a worst case. If it reads your CV, most
          ATS will too.
        </p>
      </div>
      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Clicking the area opens the picker too; the button is the keyboard route, and stops its click bubbling here. */}
          <div
            data-dragging={dragging || undefined}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 sm:py-12 motion-safe:transition-colors",
              dragging ? "border-primary bg-primary/10" : "border-foreground/15 bg-foreground/5 hover:bg-foreground/10",
            )}
          >
            <UploadIcon aria-hidden className={cn("size-9", dragging ? "text-primary" : "text-muted-foreground")} />
            <p className="text-lg font-medium">{dragging ? "Drop your PDF to read it" : "Drop your CV here"}</p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              aria-label="CV as a PDF"
              className="sr-only"
              tabIndex={-1}
              onClick={(event) => event.stopPropagation()}
              onChange={onChange}
            />
            <Button
              ref={buttonRef}
              size="lg"
              className="min-w-40 px-6 text-base"
              onClick={(event) => {
                event.stopPropagation();
                inputRef.current?.click();
              }}
            >
              <UploadIcon aria-hidden />
              Upload CV
            </Button>
            <p className="text-sm text-foreground/75 dark:text-muted-foreground">PDF · up to 5 MB · English or Danish</p>
          </div>
          {/* The icon is inline, so it stays at the start of the text when the line wraps. */}
          <p className="text-sm text-balance">
            <LockIcon aria-hidden className="mr-1.5 inline size-4 align-[-0.2em] text-primary" />
            Your CV never leaves your device.
          </p>
          <a
            href={SAMPLE_CV}
            onClick={(event) => void trySample(event)}
            aria-busy={loadingSample || undefined}
            className="rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {loadingSample ? "Getting the sample CV…" : "Or try it with a sample CV"}
          </a>
        </div>
        {/* An example to show what the page does, not a result: hidden from screen readers and out of the tab order. */}
        <figure aria-hidden inert className="hidden flex-col gap-2 lg:flex">
          <figcaption className="text-sm font-medium text-foreground/75 dark:text-muted-foreground">What you’ll get</figcaption>
          <div
            className="pointer-events-none h-72 overflow-hidden rounded-xl border bg-surface p-4 mask-[linear-gradient(to_bottom,black_70%,transparent)] shadow-sm"
          >
            <ParseResult result={exampleResult} />
          </div>
        </figure>
      </div>
    </div>
  );
};
