import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppHeader } from "@/components/app-header/app-header";
import { AtsWorkspace } from "@/components/ats/ats-workspace/ats-workspace";
import { UploadView } from "@/components/ats/upload-view/upload-view";
import { LARGE_SCREEN_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { usePdfPreview } from "@/hooks/use-pdf-preview";
import { useWindowFileDrop } from "@/hooks/use-window-file-drop";
import { withViewTransition } from "@/lib/view-transition";
import { useAtsParse } from "@/parser/use-ats-parse";

const HomePage = () => {
  // The file lives in memory only, so a reload returns to the upload view.
  const [file, setFile] = useState<File | null>(null);
  // Coming back from a result puts focus on the upload button.
  const [cameBack, setCameBack] = useState(false);
  const preview = usePdfPreview(file);
  const { parse, start, reset } = useAtsParse();
  const largeScreen = useMediaQuery(LARGE_SCREEN_QUERY);

  const choose = (chosen: File) =>
    withViewTransition(() => {
      setFile(chosen);
      start(chosen);
    });

  const showingUpload = !file || !parse;
  // A drop anywhere else on the page would make the browser open the file, so it's claimed in
  // both views, and only acted on in the upload view.
  const dragging = useWindowFileDrop(showingUpload ? choose : undefined);

  if (showingUpload) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto w-full max-w-5xl px-4 pt-16 pb-12 sm:pt-24">
          <div className="[view-transition-name:ats-upload]">
            <UploadView onFile={choose} dragging={dragging} focusButton={cameBack} />
          </div>
        </main>
      </>
    );
  }

  // Below the return above: the prerendered page is the upload view, and Node has no `navigator`.
  const inlinePdf = largeScreen && navigator.pdfViewerEnabled;
  const backToUpload = () =>
    withViewTransition(() => {
      reset();
      setFile(null);
      setCameBack(true);
    });

  return (
    <>
      {/* The logo links to `/`, where this already is, so it resets the page as "Check another CV" does. */}
      <AppHeader onHome={backToUpload} />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 lg:h-[calc(100dvh-var(--spacing-header))]">
        <h1 className="sr-only">Your CV as a simple parser sees it</h1>
        <div className="lg:h-full [view-transition-name:ats-result]">
          <AtsWorkspace
            parse={parse}
            fileUrl={preview.url}
            pdfUnavailable={preview.unavailable}
            inlinePdf={inlinePdf}
            onReset={backToUpload}
          />
        </div>
      </main>
    </>
  );
};

export const Route = createFileRoute("/")({
  component: HomePage,
});
