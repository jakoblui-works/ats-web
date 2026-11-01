import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { invisibleResult, partialResult, readableResult } from "@/components/ats/fixtures";

import { ParseSummary } from "./parse-summary";

const row = (label: string) => screen.getByText(label, { selector: "span" }).closest("li") as HTMLElement;

describe("ParseSummary", () => {
  it("marks every row found, with counts for jobs and education", () => {
    render(<ParseSummary result={readableResult} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText("Not found")).toBeNull();
    expect(row("Name")).toHaveTextContent("Found");
    expect(row("Jobs")).toHaveTextContent(`${readableResult.experience.length} found`);
    expect(row("Education")).toHaveTextContent(`${readableResult.education.length} found`);
  });

  it("says in text which rows are missing, and counts the rest", () => {
    render(<ParseSummary result={partialResult} />);
    for (const label of ["Name", "Email", "Phone", "Jobs", "Education"]) {
      expect(row(label)).toHaveTextContent("Not found");
    }
  });

  it("counts jobs when some are found", () => {
    render(<ParseSummary result={{ ...partialResult, experience: readableResult.experience }} />);
    expect(row("Jobs")).toHaveTextContent(`${readableResult.experience.length} found`);
    expect(row("Jobs")).not.toHaveTextContent("Not found");
  });

  it("shows everything missing when nothing could be read", () => {
    render(<ParseSummary result={invisibleResult} />);
    expect(within(screen.getByRole("list")).getAllByText("Not found")).toHaveLength(5);
  });

  it("treats an empty string like a missing value", () => {
    render(
      <ParseSummary
        result={{ ...readableResult, contact: { ...readableResult.contact, email: "", phone: "" } }}
      />,
    );
    expect(row("Email")).toHaveTextContent("Not found");
    expect(row("Phone")).toHaveTextContent("Not found");
  });
});
