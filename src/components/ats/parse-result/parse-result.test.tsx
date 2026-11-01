import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ParseResultOutput } from "@/api/generated/model";
import { invisibleResult, readableResult } from "@/components/ats/fixtures";

import { ParseResult } from "./parse-result";

const MISSING = "Not found";

const fieldValue = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement;

describe("ParseResult shows a missing field as missing", () => {
  it.each([
    ["null", null],
    ["an empty string", ""],
  ])("for contact fields that are %s", (_name, empty) => {
    const result: ParseResultOutput = {
      ...readableResult,
      contact: { name: empty, email: empty, phone: empty, location: empty, links: [] },
    };
    render(<ParseResult result={result} />);
    for (const label of ["Email", "Phone", "Links"]) {
      expect(fieldValue(label)).toHaveTextContent(MISSING);
    }
  });

  it("doesn't mark a field that has a value", () => {
    render(<ParseResult result={readableResult} />);
    expect(fieldValue("Email")).toHaveTextContent(readableResult.contact.email!);
    expect(fieldValue("Email")).not.toHaveTextContent(MISSING);
  });

  it("doesn't render a section with no text blank", () => {
    render(
      <ParseResult
        result={{ ...readableResult, sections: [{ kind: "other", heading: "Interests", text: "" }] }}
      />,
    );
    const item = screen.getByRole("heading", { name: "Interests" }).closest("li")!;
    expect(item.textContent).toMatch(/no text/i);
  });

  it("hides the character count when nothing is readable, and shows it otherwise", () => {
    const { unmount } = render(<ParseResult result={{ ...invisibleResult, character_count: 9629 }} />);
    expect(screen.queryByText(/characters read/i)).toBeNull();
    unmount();
    render(<ParseResult result={readableResult} />);
    expect(screen.getByText(/characters read/i)).toBeInTheDocument();
  });
});
