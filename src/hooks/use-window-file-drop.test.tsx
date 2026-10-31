import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWindowFileDrop } from "./use-window-file-drop";

afterEach(cleanup);

/** jsdom has no DragEvent; this is an event the hook can't tell apart from one. */
const drag = (type: string, types: string[], files: File[] = [], relatedTarget: EventTarget | null = null) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { types, files } });
  Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
};

const cv = () => new File(["%PDF-1"], "cv.pdf", { type: "application/pdf" });

describe("useWindowFileDrop", () => {
  it.each(["dragenter", "dragover", "drop"])("prevents the default of a file %s, so the browser doesn't navigate", (type) => {
    renderHook(() => useWindowFileDrop(vi.fn()));
    expect(drag(type, ["Files"], [cv()]).defaultPrevented).toBe(true);
  });

  it.each(["dragenter", "dragover", "drop"])("leaves a non-file %s alone", (type) => {
    const onFile = vi.fn();
    renderHook(() => useWindowFileDrop(onFile));
    expect(drag(type, ["text/plain"]).defaultPrevented).toBe(false);
    expect(onFile).not.toHaveBeenCalled();
  });

  it("still claims file drags when there's no handler, and does not report dragging", () => {
    const { result } = renderHook(() => useWindowFileDrop());
    expect(drag("dragover", ["Files"]).defaultPrevented).toBe(true);
    expect(result.current).toBe(false);
    expect(drag("drop", ["Files"], [cv()]).defaultPrevented).toBe(true);
  });

  it("reports a file being dragged over the page, until it leaves or drops", () => {
    const { result } = renderHook(() => useWindowFileDrop(vi.fn()));
    expect(result.current).toBe(false);
    drag("dragenter", ["Files"]);
    expect(result.current).toBe(true);
    drag("dragleave", ["Files"], [], null);
    expect(result.current).toBe(false);

    drag("dragover", ["Files"]);
    expect(result.current).toBe(true);
    drag("drop", ["Files"], [cv()]);
    expect(result.current).toBe(false);
  });

  it("does not report dragging for a non-file drag", () => {
    const { result } = renderHook(() => useWindowFileDrop(vi.fn()));
    drag("dragenter", ["text/plain"]);
    expect(result.current).toBe(false);
  });

  it("gives the first dropped file to the handler", () => {
    const onFile = vi.fn();
    renderHook(() => useWindowFileDrop(onFile));
    const first = cv();
    const second = new File(["x"], "other.pdf");
    drag("drop", ["Files"], [first, second]);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile).toHaveBeenCalledWith(first);
  });

  it("uses the latest handler without re-subscribing", () => {
    const old = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderHook(({ cb }) => useWindowFileDrop(cb), { initialProps: { cb: old } });
    rerender({ cb: latest });
    drag("drop", ["Files"], [cv()]);
    expect(old).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("stops claiming drags after unmount", () => {
    const onFile = vi.fn();
    const { unmount } = renderHook(() => useWindowFileDrop(onFile));
    unmount();
    expect(drag("drop", ["Files"], [cv()]).defaultPrevented).toBe(false);
    expect(onFile).not.toHaveBeenCalled();
  });
});
