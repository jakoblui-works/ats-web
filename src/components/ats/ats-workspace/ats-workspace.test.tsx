import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { readableResult } from "@/components/ats/fixtures";

import { AtsWorkspace } from "./ats-workspace";

const renderDone = () =>
  render(
    <AtsWorkspace
      parse={{ status: "done", result: readableResult }}
      fileUrl={null}
      inlinePdf={false}
      onReset={() => {}}
    />,
  );

describe("AtsWorkspace announcing a result", () => {
  it("has the status region announce it when focus stayed elsewhere", () => {
    const other = document.createElement("button");
    document.body.append(other);
    other.focus();
    renderDone();
    expect(screen.getByRole("status").textContent).toMatch(/result is ready/i);
    other.remove();
  });

  it("leaves the status region quiet when focus moved to the status line", () => {
    (document.activeElement as HTMLElement | null)?.blur();
    renderDone();
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
