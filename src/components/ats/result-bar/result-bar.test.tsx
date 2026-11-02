import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtsFailureReason, AtsParse } from "@/api/ats";
import type { ParseResultOutput } from "@/api/generated/model";
import { invisibleResult, partialResult, readableResult } from "@/components/ats/fixtures";

import { ResultBar } from "./result-bar";

const status = () => screen.getByRole("heading", { level: 2 });
const done = (result: ParseResultOutput): AtsParse => ({ status: "done", result });
const renderBar = (result: ParseResultOutput) => render(<ResultBar parse={done(result)} onReset={() => {}} />);
const without = (contact: Partial<ParseResultOutput["contact"]>): ParseResultOutput => ({
  ...readableResult,
  contact: { ...readableResult.contact, ...contact },
});

/** Failures after the file was stored, and ones that turned it away (or can't know it was deleted). */
const STORED: AtsFailureReason[] = ["too-many-pages", "encrypted", "corrupt"];
const NOT_STORED: AtsFailureReason[] = ["rate-limited", "too-large", "not-pdf", "error", "timed-out"];

const EVERY_STATE: [string, AtsParse][] = [
  ["uploading", { status: "uploading" }],
  ["processing", { status: "processing" }],
  ["done", done(readableResult)],
  ...[...STORED, ...NOT_STORED].map((reason): [string, AtsParse] => [
    `failed (${reason})`,
    { status: "failed", reason },
  ]),
];

afterEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
});

describe("ResultBar status", () => {
  it("is green only when everything was found", () => {
    const { container, unmount } = renderBar(readableResult);
    expect(container.querySelector("[class*=emerald]")).not.toBeNull();
    unmount();
    const { container: missing } = renderBar(without({ phone: null }));
    expect(missing.querySelector("[class*=emerald]")).toBeNull();
  });

  it.each([
    ["a null value", without({ phone: null }), ["phone"]],
    ["an empty string", without({ email: "" }), ["email"]],
    ["no jobs", { ...readableResult, experience: [] }, ["jobs"]],
    ["several things", { ...without({ name: null }), education: [] }, ["name", "education"]],
  ])("names what's missing for %s", (_name, result, missing) => {
    renderBar(result);
    for (const detail of missing) expect(status().textContent).toContain(detail);
  });

  it("says a partial or invisible result isn't readable, without listing details", () => {
    const { unmount } = renderBar(partialResult);
    expect(status().textContent).toMatch(/partly/i);
    expect(status().textContent).not.toMatch(/missing/i);
    unmount();
    renderBar(invisibleResult);
    expect(status().textContent).toMatch(/not readable/i);
  });
});

describe("ResultBar before the result", () => {
  it.each([
    ["uploading", { status: "uploading" } as AtsParse, /^Uploading your CV…?$/],
    ["processing", { status: "processing" } as AtsParse, /^Reading your CV…?$/],
  ])("shows a spinner and says what it's doing while %s", (_name, parse, title) => {
    const { container } = render(<ResultBar parse={parse} onReset={() => {}} />);
    expect(status().textContent?.trim()).toMatch(title);
    expect(container.querySelector("[data-slot=spinner]")).not.toBeNull();
  });

  it("has no spinner once the result is there", () => {
    const { container } = renderBar(readableResult);
    expect(container.querySelector("[data-slot=spinner]")).toBeNull();
  });

  it.each([...STORED, ...NOT_STORED])("has a failure title for %s, without a spinner", (reason) => {
    const { container } = render(<ResultBar parse={{ status: "failed", reason }} onReset={() => {}} />);
    expect(status().textContent?.trim()).not.toBe("");
    expect(status().textContent).not.toMatch(/uploading|reading your cv|found your details/i);
    expect(container.querySelector("[data-slot=spinner]")).toBeNull();
  });
});

describe("ResultBar in every state", () => {
  it.each(EVERY_STATE)("has a level-2 heading and Check another CV, which resets, when %s", (_name, parse) => {
    const onReset = vi.fn();
    render(<ResultBar parse={parse} onReset={onReset} />);
    expect(status()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check another CV" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["uploading", { status: "uploading" } as AtsParse],
    ["processing", { status: "processing" } as AtsParse],
    ["done", done(readableResult)],
    ...STORED.map((reason): [string, AtsParse] => [`failed (${reason})`, { status: "failed", reason }]),
  ])("says the file is deleted when %s", (_name, parse) => {
    render(<ResultBar parse={parse} onReset={() => {}} />);
    expect(screen.getAllByText(/deleted right after it is parsed/)).toHaveLength(1);
  });

  it.each(NOT_STORED)("makes no deletion claim for %s", (reason) => {
    render(<ResultBar parse={{ status: "failed", reason }} onReset={() => {}} />);
    expect(screen.queryByText(/deleted right after/)).toBeNull();
  });
});

describe("focus when a result arrives", () => {
  it("doesn't move when the bar mounts while uploading or processing", () => {
    const onFocusKept = vi.fn();
    const { unmount } = render(<ResultBar parse={{ status: "uploading" }} onReset={() => {}} onFocusKept={onFocusKept} />);
    expect(document.activeElement).toBe(document.body);
    unmount();
    render(<ResultBar parse={{ status: "processing" }} onReset={() => {}} onFocusKept={onFocusKept} />);
    expect(document.activeElement).toBe(document.body);
    expect(onFocusKept).not.toHaveBeenCalled();
  });

  it("moves to the status on the change to done when nothing has focus", () => {
    const onFocusKept = vi.fn();
    const { rerender } = render(
      <ResultBar parse={{ status: "processing" }} onReset={() => {}} onFocusKept={onFocusKept} />,
    );
    expect(status()).not.toHaveFocus();
    rerender(<ResultBar parse={done(readableResult)} onReset={() => {}} onFocusKept={onFocusKept} />);
    expect(status()).toHaveFocus();
    expect(onFocusKept).not.toHaveBeenCalled();
  });

  it("leaves focus where the visitor is on the change to done, and says so through onFocusKept", () => {
    const other = document.createElement("button");
    document.body.append(other);
    other.focus();
    const onFocusKept = vi.fn();
    const { rerender } = render(
      <ResultBar parse={{ status: "processing" }} onReset={() => {}} onFocusKept={onFocusKept} />,
    );
    // Nothing has arrived yet, so there's nothing to announce.
    expect(onFocusKept).not.toHaveBeenCalled();
    rerender(<ResultBar parse={done(readableResult)} onReset={() => {}} onFocusKept={onFocusKept} />);
    expect(other).toHaveFocus();
    expect(onFocusKept).toHaveBeenCalledTimes(1);
    other.remove();
  });
});
