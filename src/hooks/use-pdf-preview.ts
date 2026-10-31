import { useEffect, useState } from "react";

import { looksLikePdf } from "@/lib/pdf";

type PdfPreview = {
  /** An object URL for showing the file, or `null` until it is ready (or when there's no preview). */
  url: string | null;
  /** The file isn't a PDF, so it must not be shown. */
  unavailable: boolean;
};

const NONE: PdfPreview = { url: null, unavailable: false };

/**
 * An object URL to preview a file the user picked, or none without one. Dragging and dropping
 * bypasses the picker's `accept`, and a blob URL takes the origin of this page, so a dropped
 * HTML or SVG file shown from its own URL would run here. So the file is only previewed when it
 * starts with `%PDF-`, and always as a new blob typed `application/pdf`, whatever the file says.
 * Revoked when the file is replaced and when the component unmounts. Nothing is made while
 * rendering on the server or in the first client render, since it happens in an effect.
 */
export const usePdfPreview = (file: Blob | null): PdfPreview => {
  const [preview, setPreview] = useState<PdfPreview>(NONE);
  useEffect(() => {
    if (!file) {
      setPreview(NONE);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    looksLikePdf(file)
      .then((isPdf) => {
        if (cancelled) return;
        if (!isPdf) {
          setPreview({ url: null, unavailable: true });
          return;
        }
        objectUrl = URL.createObjectURL(new Blob([file], { type: "application/pdf" }));
        setPreview({ url: objectUrl, unavailable: false });
      })
      // Unreadable (a folder, a moved file): nothing to show.
      .catch(() => {
        if (!cancelled) setPreview({ url: null, unavailable: true });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);
  return preview;
};
