import { flushSync } from "react-dom";

/**
 * Runs a state update inside a view transition where the browser has them, and plainly where it
 * doesn't. The update is flushed synchronously, because the browser takes its "after" snapshot
 * when the callback returns. Reduced motion is handled in CSS (`styles.css`).
 */
export const withViewTransition = (update: () => void) => {
  if (typeof document === "undefined" || !document.startViewTransition) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
};
