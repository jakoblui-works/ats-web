import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ParseResultOutput } from "@/api/generated/model";
import { readableResult } from "@/components/ats/fixtures";

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
    for (const label of ["Name", "Email", "Phone", "Location", "Links"]) {
      expect(fieldValue(label)).toHaveTextContent(MISSING);
    }
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
  ])("for experience and education entries with %s fields", (_name, empty) => {
    render(
      <ParseResult
        result={{
          ...readableResult,
          experience: [{ title: empty, company: empty, start: empty, end: empty }],
          education: [{ institution: empty, qualification: empty, start: empty, end: empty }],
        }}
      />,
    );
    for (const heading of ["Experience", "Education"]) {
      const section = screen.getByRole("heading", { name: heading }).closest("section")!;
      const entry = within(section).getByRole("listitem");
      // Both lines, and the dates, say so; none is blank.
      expect(within(entry).getAllByText(/not found|no dates found/i).length).toBeGreaterThanOrEqual(3);
      expect(entry.textContent?.trim()).not.toBe("");
    }
  });

  it("doesn't mark a field that has a value", () => {
    render(<ParseResult result={readableResult} />);
    expect(fieldValue("Name")).toHaveTextContent(readableResult.contact.name!);
    expect(fieldValue("Name")).not.toHaveTextContent(MISSING);
  });
});
