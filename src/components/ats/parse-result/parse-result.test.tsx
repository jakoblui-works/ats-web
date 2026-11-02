import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ParseResultOutput } from "@/api/generated/model";
import { invisibleResult, readableResult } from "@/components/ats/fixtures";

import { ParseResult } from "./parse-result";

const MISSING = "Not found";

const showTab = (result: ParseResultOutput, name: RegExp) => {
  const view = render(<ParseResult result={result} />);
  fireEvent.click(screen.getByRole("tab", { name }));
  return view;
};

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

  it("hides the character count when nothing is readable, and shows it otherwise", () => {
    const { unmount } = render(<ParseResult result={{ ...invisibleResult, character_count: 9629 }} />);
    expect(screen.queryByText(/characters/i)).toBeNull();
    unmount();
    render(<ParseResult result={readableResult} />);
    expect(screen.getByText(/characters/i)).toBeInTheDocument();
  });
});

const job = (over: Partial<ParseResultOutput["experience"][number]> = {}) => ({
  title: "Engineer",
  company: null,
  start: "Jan 2020",
  end: "Mar 2022",
  months: 27,
  ...over,
});

const withJobs = (experience: ParseResultOutput["experience"], experience_months: number | null) => ({
  ...readableResult,
  experience,
  experience_months,
});

const experienceBlock = () => screen.getByRole("tabpanel");

describe("ParseResult experience", () => {
  it("shows a row per job with title, dates as written and length", () => {
    showTab(withJobs([job(), job({ title: "Lead", start: "Apr 2022", end: "Present", months: 12 })], 39), /^Experience/);
    const items = within(experienceBlock()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Engineer");
    expect(items[0]).toHaveTextContent("Jan 2020 to Mar 2022");
    expect(items[0]).toHaveTextContent("2 yrs 3 mos");
    expect(items[1]).toHaveTextContent("Apr 2022 to Present");
  });

  it.each([
    ["null", null],
    ["empty", ""],
  ])("shows a %s title as not found", (_name, title) => {
    showTab(withJobs([job({ title, company: "Invented Ltd" })], 27), /^Experience/);
    expect(within(experienceBlock()).getByText(MISSING)).toBeInTheDocument();
  });

  it("says about on a year-only job and on the total", () => {
    showTab(withJobs([job({ start: "2012", end: "2014", months: 24 })], 24), /^Experience/);
    expect(within(experienceBlock()).getAllByText(/about 2 yrs/)).toHaveLength(2);
    expect(screen.getByText(/^Total: about 2 yrs/)).toBeInTheDocument();
  });

  it("doesn't say about when every date has a month", () => {
    showTab(withJobs([job()], 27), /^Experience/);
    expect(within(experienceBlock()).queryByText(/about/i)).toBeNull();
    expect(screen.getByText("Total: 2 yrs 3 mos")).toBeInTheDocument();
  });

  it("uses singular forms for one year and one month", () => {
    showTab(withJobs([job({ months: 13 }), job({ months: 12 }), job({ months: 1 })], 25), /^Experience/);
    const items = within(experienceBlock()).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1 yr 1 mo");
    expect(items[1]!.textContent).toMatch(/, 1 yr$/);
    expect(items[2]).toHaveTextContent("1 mo");
    expect(screen.getByText("Total: 2 yrs 1 mo")).toBeInTheDocument();
  });

  it("shows no length for 0 or null months, and no total for a null total", () => {
    showTab(withJobs([job({ months: 0 }), job({ months: null })], null), /^Experience/);
    const items = within(experienceBlock()).getAllByRole("listitem");
    for (const item of items) expect(item.textContent).not.toMatch(/yr|mo\b/);
    expect(screen.queryByText(/^Total/)).toBeNull();
    expect(screen.queryByText(/overlap/i)).toBeNull();
  });

  it("explains that overlapping jobs count once", () => {
    showTab(withJobs([job()], 27), /^Experience/);
    expect(screen.getByText(/overlap/i)).toBeInTheDocument();
  });

  it("shows a missing block when there are no jobs", () => {
    showTab(withJobs([], null), /^Experience/);
    expect(within(experienceBlock()).getByText(/not found|no jobs/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Total/)).toBeNull();
  });
});

describe("ParseResult shows name, employer, and education", () => {
  it("shows the name, and marks it missing when absent", () => {
    const { unmount } = render(<ParseResult result={readableResult} />);
    expect(fieldValue("Name")).toHaveTextContent(readableResult.contact.name!);
    unmount();
    render(<ParseResult result={{ ...readableResult, contact: { ...readableResult.contact, name: null } }} />);
    expect(fieldValue("Name")).toHaveTextContent(MISSING);
  });

  it("shows an employer under the title, and marks it missing when absent", () => {
    const { unmount } = showTab({ ...readableResult, experience: [job({ company: "Invented Ltd" })] }, /^Experience/);
    expect(screen.getByText("Invented Ltd")).toBeInTheDocument();
    unmount();
    showTab({ ...readableResult, experience: [job({ company: null })] }, /^Experience/);
    const item = screen.getByText("Engineer").closest("li")!;
    expect(item.children[1]).toHaveTextContent(MISSING);
  });

  it("shows an education row with a missing part as not found", () => {
    showTab({ ...readableResult, education: [{ qualification: null, institution: "Sample College", start: "2010", end: "2012" }], }, /^Education/);
    const item = screen.getByText("Sample College").closest("li")!;
    expect(item).toHaveTextContent(MISSING);
    expect(item).toHaveTextContent("2010 to 2012");
  });

  it("shows a lone year without a made-up start", () => {
    showTab({ ...readableResult, education: [{ qualification: "Diploma", institution: "Sample College", start: null, end: "2015" }], }, /^Education/);
    const item = screen.getByText("Sample College").closest("li")!;
    expect(item).toHaveTextContent("2015");
    expect(item).not.toHaveTextContent(MISSING);
    expect(item).not.toHaveTextContent("to 2015");
  });

  it("says so when there is no education", () => {
    showTab({ ...readableResult, education: [] }, /^Education/);
    expect(screen.getByText("No education found")).toBeInTheDocument();
  });
});

describe("ParseResult tabs", () => {
  it("shows no tabs when nothing could be read, but keeps the warnings", () => {
    render(<ParseResult result={invisibleResult} />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("Things to look at")).toBeInTheDocument();
  });

  it("counts jobs and education in the tab names, and says when there are none", () => {
    render(<ParseResult result={readableResult} />);
    expect(screen.getByRole("tab", { name: `Experience ${readableResult.experience.length}` })).toBeInTheDocument();
    cleanup();
    render(<ParseResult result={{ ...readableResult, experience: [], education: [] }} />);
    expect(screen.getByRole("tab", { name: /Experience.*none found/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Education.*none found/ })).toBeInTheDocument();
  });

  it("marks the contact tab only when a contact detail is missing", () => {
    render(<ParseResult result={readableResult} />);
    expect(screen.getByRole("tab", { name: "Contact" })).toBeInTheDocument();
    cleanup();
    render(<ParseResult result={{ ...readableResult, contact: { ...readableResult.contact, phone: null } }} />);
    expect(screen.getByRole("tab", { name: /Contact.*missing/ })).toBeInTheDocument();
  });

  it("explains a partial result even when it has no warnings", () => {
    render(<ParseResult result={{ ...readableResult, visibility: "partial", warnings: [] }} />);
    expect(screen.getByText("Things to look at")).toBeInTheDocument();
    expect(screen.getByText(/may be missing or in the wrong order/)).toBeInTheDocument();
  });

  it("puts the singular page count in the text tab", () => {
    showTab({ ...readableResult, page_count: 1 }, /^Text/);
    expect(within(screen.getByRole("tabpanel")).getByText(/characters read from 1 page$/)).toBeInTheDocument();
  });

  it("lists the headings it found in the text tab", () => {
    showTab(
      {
        ...readableResult,
        sections: [
          { kind: "experience", heading: "Work history", text: "" },
          { kind: "other", heading: "Interests", text: "" },
        ],
      },
      /^Text/,
    );
    expect(within(screen.getByRole("tabpanel")).getByText("Work history, Interests")).toBeInTheDocument();
  });

  it("says so when it found no headings", () => {
    showTab({ ...readableResult, sections: [] }, /^Text/);
    expect(within(screen.getByRole("tabpanel")).getByText("None")).toBeInTheDocument();
  });

  it("keeps a search when the visitor looks at another tab and comes back", () => {
    showTab(readableResult, /^Text/);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "engineer" } });
    fireEvent.click(screen.getByRole("tab", { name: /^Contact/ }));
    fireEvent.click(screen.getByRole("tab", { name: /^Text/ }));
    expect(screen.getByRole("searchbox")).toHaveValue("engineer");
  });
});
