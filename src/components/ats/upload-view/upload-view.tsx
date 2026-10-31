import { UploadIcon } from "lucide-react";
import { useEffect, useRef, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UploadViewProps = {
  /** Called with the chosen or dropped file. */
  onFile: (file: File) => void;
  /** A file is being dragged over the page (handled at page level, see `useWindowFileDrop`). */
  dragging?: boolean;
  /** Focus the button on mount, for coming back from a result. */
  focusButton?: boolean;
};

/** The page before an upload: one centred view with the page's only primary button, and a drop target. */
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

  return (
    <div
      data-dragging={dragging || undefined}
      className={cn(
        "flex flex-col items-center gap-6 rounded-lg border border-dashed p-8 text-center sm:p-12 motion-safe:transition-colors",
        dragging && "border-primary bg-surface",
      )}
    >
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">See what a simple parser sees</h1>
        <p className="text-muted-foreground">
          Upload your CV as a PDF and see the text a simple parser would pull out of it.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="CV as a PDF"
        className="sr-only"
        tabIndex={-1}
        onChange={onChange}
      />
      <Button
        ref={buttonRef}
        size="lg"
        className="min-w-40 px-6 text-base"
        onClick={() => inputRef.current?.click()}
      >
        <UploadIcon aria-hidden />
        Upload CV
      </Button>
      <p className="text-sm text-muted-foreground">Or drop a PDF here.</p>
      <p className="max-w-prose text-sm text-muted-foreground">
        Your file is deleted right after it is parsed, and the result expires within an hour.
      </p>
    </div>
  );
};
