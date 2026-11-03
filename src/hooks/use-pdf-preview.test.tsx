import { fc, test } from "@fast-check/vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePdfPreview } from "./use-pdf-preview";

// jsdom has no object URLs, so they're recorded here: which blob each URL was made for.
let blobs: Map<string, Blob>;
let revoked: string[];

beforeEach(() => {
  blobs = new Map();
  revoked = [];
  let next = 0;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:test/${next++}`;
    blobs.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

afterEach(() => {
  cleanup();
});

const file = (content: string, type: string, name = "cv.pdf") => new File([content], name, { type });

describe("usePdfPreview", () => {
  it("has nothing without a file", () => {
    const { result } = renderHook(() => usePdfPreview(null));
    expect(result.current).toEqual({ url: null, unavailable: false });
  });

  it("gives a URL for a PDF, to a blob typed application/pdf", async () => {
    const source = file("%PDF-1.7 body", "application/pdf");
    const { result } = renderHook(() => usePdfPreview(source));
    await waitFor(() => expect(result.current.url).not.toBeNull());
    expect(result.current.unavailable).toBe(false);
    expect(blobs.get(result.current.url!)?.type).toBe("application/pdf");
  });

  it("types the blob as a PDF whatever the file claims", async () => {
    for (const claimed of ["text/html", "image/svg+xml", ""]) {
      const source = file("%PDF-1.4 x", claimed, "x.html");
      const { result, unmount } = renderHook(() => usePdfPreview(source));
      await waitFor(() => expect(result.current.url).not.toBeNull());
      expect(blobs.get(result.current.url!)?.type).toBe("application/pdf");
      unmount();
    }
  });

  it("keeps the file's content in the blob", async () => {
    const source = file("%PDF-1.7 hello", "application/pdf");
    const { result } = renderHook(() => usePdfPreview(source));
    await waitFor(() => expect(result.current.url).not.toBeNull());
    expect(await blobs.get(result.current.url!)!.text()).toBe("%PDF-1.7 hello");
  });

  it("refuses a file that doesn't start with %PDF-, even if its type says PDF", async () => {
    for (const content of ["<html><script>alert(1)</script></html>", "<svg onload=alert(1)>", "", "%PDF", " %PDF-1.4"]) {
      const source = file(content, "application/pdf");
      const { result, unmount } = renderHook(() => usePdfPreview(source));
      await waitFor(() => expect(result.current.unavailable).toBe(true));
      expect(result.current.url).toBeNull();
      unmount();
    }
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test.prop([fc.uint8Array({ maxLength: 40 }).filter((bytes) => new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")], {
    numRuns: 25,
  })("never makes a URL for bytes without the PDF header", async (bytes) => {
    const upload = new File([bytes], "cv.pdf", { type: "application/pdf" });
    const { result, unmount } = renderHook(() => usePdfPreview(upload));
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.url).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    unmount();
  });

  it("revokes the URL when the file is replaced, and shows the new one", async () => {
    const first = file("%PDF-1 a", "application/pdf");
    const second = file("%PDF-1 b", "application/pdf");
    const { result, rerender } = renderHook(({ f }) => usePdfPreview(f), { initialProps: { f: first } });
    await waitFor(() => expect(result.current.url).not.toBeNull());
    const firstUrl = result.current.url!;

    rerender({ f: second });
    await waitFor(() => expect(result.current.url).not.toBe(firstUrl));
    await waitFor(() => expect(result.current.url).not.toBeNull());
    expect(revoked).toContain(firstUrl);
    expect(revoked).not.toContain(result.current.url);
  });

  it("revokes the URL on unmount", async () => {
    const source = file("%PDF-1 a", "application/pdf");
    const { result, unmount } = renderHook(() => usePdfPreview(source));
    await waitFor(() => expect(result.current.url).not.toBeNull());
    const url = result.current.url!;
    expect(revoked).not.toContain(url);
    unmount();
    expect(revoked).toContain(url);
  });

  it("goes back to nothing when the file is removed, revoking its URL", async () => {
    const { result, rerender } = renderHook(({ f }: { f: File | null }) => usePdfPreview(f), {
      initialProps: { f: file("%PDF-1 a", "application/pdf") as File | null },
    });
    await waitFor(() => expect(result.current.url).not.toBeNull());
    const url = result.current.url!;
    rerender({ f: null });
    await waitFor(() => expect(result.current).toEqual({ url: null, unavailable: false }));
    expect(revoked).toContain(url);
  });

  it("makes no URL for a file replaced before it was read", async () => {
    const first = file("%PDF-1 a", "application/pdf");
    const second = file("<html>", "application/pdf");
    const { result, rerender } = renderHook(({ f }) => usePdfPreview(f), { initialProps: { f: first } });
    rerender({ f: second });
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    // Whatever was made for the first file is not left live.
    const live = [...blobs.keys()].filter((url) => !revoked.includes(url));
    expect(live).toEqual([]);
  });

  it("gives unavailable, with no unhandled rejection, for a blob whose read rejects", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    const proc = (globalThis as unknown as { process: { on: (e: string, f: (r: unknown) => void) => void; off: (e: string, f: (r: unknown) => void) => void } }).process;
    proc.on("unhandledRejection", listener);
    try {
      const broken = file("%PDF-1 a", "application/pdf");
      broken.slice = () => ({ text: () => Promise.reject(new Error("NotReadableError")) }) as unknown as Blob;
      const { result } = renderHook(() => usePdfPreview(broken));
      await waitFor(() => expect(result.current).toEqual({ url: null, unavailable: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    } finally {
      proc.off("unhandledRejection", listener);
    }
  });
});
