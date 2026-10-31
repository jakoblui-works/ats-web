import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { readableResult } from "@/components/ats/fixtures";

import { ParseResult } from "../parse-result/parse-result";
import { ResultPanel } from "./result-panel";

const verdict = () => screen.getByRole("heading", { level: 2 });

/** Something else on the page that has focus when the result lands (the visitor moved on). */
const focusElsewhere = () => {
  const other = document.createElement("button");
  other.textContent = "elsewhere";
  document.body.append(other);
  other.focus();
  expect(other).toHaveFocus();
  return other;
};

describe("focus when a result arrives", () => {
  it("moves to the verdict when nothing has focus, without announcing through the status region", () => {
    const onFocusKept = vi.fn();
    (document.activeElement as HTMLElement | null)?.blur();
    render(<ParseResult result={readableResult} onFocusKept={onFocusKept} />);
    expect(verdict()).toHaveFocus();
    expect(onFocusKept).not.toHaveBeenCalled();
  });

  it("leaves focus where the visitor is, and says so through onFocusKept", () => {
    const other = focusElsewhere();
    const onFocusKept = vi.fn();
    render(<ParseResult result={readableResult} onFocusKept={onFocusKept} />);
    expect(other).toHaveFocus();
    expect(verdict()).not.toHaveFocus();
    expect(onFocusKept).toHaveBeenCalledTimes(1);
    other.remove();
  });

  it("has the status region announce the result when focus stayed elsewhere", () => {
    const other = focusElsewhere();
    render(<ResultPanel parse={{ status: "done", result: readableResult }} onReset={() => {}} />);
    expect(other).toHaveFocus();
    expect(screen.getByRole("status").textContent).toMatch(/result is ready/i);
    other.remove();
  });

  it("leaves the status region quiet when focus moved to the verdict", () => {
    (document.activeElement as HTMLElement | null)?.blur();
    render(<ResultPanel parse={{ status: "done", result: readableResult }} onReset={() => {}} />);
    expect(verdict()).toHaveFocus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
