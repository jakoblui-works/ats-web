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

/** The page before an upload: copy on the page, a drop area holding the page's only primary button. */
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
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">See what a simple parser sees</h1>
        <p className="text-muted-foreground">
          Upload your CV as a PDF and see the text a simple parser would pull out of it. It reads English and Danish
          CVs.
        </p>
      </div>
      {/* Clicking the area opens the picker too; the button is the keyboard route, and stops its click bubbling here. */}
      <div
        data-dragging={dragging || undefined}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed px-4 py-10 sm:py-14 motion-safe:transition-colors",
          dragging ? "border-primary bg-primary/10" : "border-border hover:bg-surface",
        )}
      >
        <UploadIcon
          aria-hidden
          className={cn("size-10", dragging ? "text-primary" : "text-muted-foreground")}
        />
        <p className="text-lg font-medium">{dragging ? "Drop your PDF to read it" : "Drop a PDF here or"}</p>
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
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">
        Your file is deleted right after it is parsed, and the result expires within an hour.
      </p>
    </div>
  );
};
