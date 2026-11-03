import { useEffect, useRef, useState } from "react";

const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Handles dragging files over the whole page. A file dropped anywhere else would make the browser
 * open it and leave the page, so every file drag is claimed while this is mounted; `onFile` gets
 * the first dropped file (leave it out to ignore drops). Returns whether a file is being dragged over the page.
 */
export const useWindowFileDrop = (onFile?: (file: File) => void): boolean => {
  const [dragging, setDragging] = useState(false);
  const handler = useRef(onFile);
  useEffect(() => {
    handler.current = onFile;
  });

  useEffect(() => {
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(handler.current !== undefined);
    };
    const leave = (event: DragEvent) => {
      // Leaving the window: there's no element the pointer went to.
      if (event.relatedTarget === null) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) handler.current?.(file);
    };
    window.addEventListener("dragenter", over);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", over);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return dragging;
};
