import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ParseResultOutput } from "@/api/generated/model";
import { invisibleResult, partialResult, readableResult } from "@/components/ats/fixtures";

import { ResultBar } from "./result-bar";

const status = () => screen.getByRole("heading", { level: 2 });
const renderBar = (result: ParseResultOutput) => render(<ResultBar result={result} onReset={() => {}} />);
const without = (contact: Partial<ParseResultOutput["contact"]>): ParseResultOutput => ({
  ...readableResult,
  contact: { ...readableResult.contact, ...contact },
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

describe("focus when a result arrives", () => {
  it("moves to the status when nothing has focus", () => {
    const onFocusKept = vi.fn();
    (document.activeElement as HTMLElement | null)?.blur();
    render(<ResultBar result={readableResult} onReset={() => {}} onFocusKept={onFocusKept} />);
    expect(status()).toHaveFocus();
    expect(onFocusKept).not.toHaveBeenCalled();
  });

  it("leaves focus where the visitor is, and says so through onFocusKept", () => {
    const other = document.createElement("button");
    document.body.append(other);
    other.focus();
    const onFocusKept = vi.fn();
    render(<ResultBar result={readableResult} onReset={() => {}} onFocusKept={onFocusKept} />);
    expect(other).toHaveFocus();
    expect(onFocusKept).toHaveBeenCalledTimes(1);
    other.remove();
  });
});
