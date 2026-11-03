import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtsFailureReason, AtsParse } from "@/parser/use-ats-parse";
import { readableResult } from "@/components/ats/fixtures";

import { AtsWorkspace } from "./ats-workspace";

const workspace = (parse: AtsParse, onReset: () => void = () => {}) => (
  <AtsWorkspace parse={parse} fileUrl={null} inlinePdf={false} onReset={onReset} />
);

const DONE: AtsParse = { status: "done", result: readableResult };
const STORED: AtsFailureReason[] = ["too-many-pages", "encrypted", "corrupt"];
const NOT_STORED: AtsFailureReason[] = ["too-large", "not-pdf", "error", "timed-out"];

afterEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
});

describe("AtsWorkspace announcing a result", () => {
  it("has the status region announce it when focus stayed elsewhere", () => {
    const other = document.createElement("button");
    document.body.append(other);
    other.focus();
    const { rerender } = render(workspace({ status: "processing" }));
    rerender(workspace(DONE));
    expect(other).toHaveFocus();
    expect(screen.getByRole("status").textContent).toMatch(/result is ready/i);
    other.remove();
  });

  it("leaves the status region quiet when focus moved to the status line", () => {
    const { rerender } = render(workspace({ status: "processing" }));
    rerender(workspace(DONE));
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("doesn't take focus when it appears while loading", () => {
    render(workspace({ status: "loading" }));
    expect(document.activeElement).toBe(document.body);
  });
});

describe("AtsWorkspace in every state", () => {
  it.each([
    ["loading", { status: "loading" } as AtsParse],
    ["processing", { status: "processing" } as AtsParse],
    ["done", DONE],
    ...[...STORED, ...NOT_STORED].map((reason): [string, AtsParse] => [`failed (${reason})`, { status: "failed", reason }]),
  ])("has one status heading and one way back when %s", (_name, parse) => {
    const onReset = vi.fn();
    render(workspace(parse, onReset));
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /try another file/i })).toBeNull();
    const back = screen.getAllByRole("button", { name: "Check another CV" });
    expect(back).toHaveLength(1);
    fireEvent.click(back[0]);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["loading", { status: "loading" } as AtsParse],
    ["processing", { status: "processing" } as AtsParse],
    ["done", DONE],
    ...[...STORED, ...NOT_STORED].map((reason): [string, AtsParse] => [
      `failed (${reason})`,
      { status: "failed", reason },
    ]),
  ])("says the CV never leaves the device exactly once when %s", (_name, parse) => {
    render(workspace(parse));
    expect(screen.getAllByText(/never leaves your device/)).toHaveLength(1);
  });

  it.each([...STORED, ...NOT_STORED])("still gives the reason below the title for %s", (reason) => {
    render(workspace({ status: "failed", reason }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent?.trim()).not.toBe("");
    expect(screen.getByRole("heading", { level: 2 })).not.toContainElement(alert);
    // Below it: the alert follows the heading in the page.
    const order = screen.getByRole("heading", { level: 2 }).compareDocumentPosition(alert);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The title and the reason are different lines, not the same text twice.
    expect(screen.getByRole("heading", { level: 2 }).textContent?.trim()).not.toBe(alert.textContent?.trim());
  });
});
