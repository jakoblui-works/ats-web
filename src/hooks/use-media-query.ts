import { useCallback, useSyncExternalStore } from "react";

/** Whether a CSS media query currently matches; re-renders when that changes. */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(query).matches,
    // No media to query while prerendering.
    () => false,
  );
};

/** Tailwind's `lg` breakpoint, where the result shows the PDF inline next to the form. */
export const LARGE_SCREEN_QUERY = "(min-width: 64rem)";
