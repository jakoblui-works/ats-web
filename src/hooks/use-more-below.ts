import { useEffect, useRef, useState } from "react";

/**
 * Whether a scroll area has more below what it shows, so it can say so (scrollbars that only appear while scrolling
 * don't). `scrollRef` goes on the scrolling element, `contentRef` on a wrapper around everything inside it: its size
 * changes when the content does, which the scroll area's own size doesn't.
 */
export const useMoreBelow = <S extends HTMLElement, C extends HTMLElement>() => {
  const scrollRef = useRef<S>(null);
  const contentRef = useRef<C>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    // A pixel of slack: zoomed pages scroll in fractions and can stop just short of the end.
    const update = () => setMoreBelow(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 1);
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(content);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return { scrollRef, contentRef, moreBelow };
};
