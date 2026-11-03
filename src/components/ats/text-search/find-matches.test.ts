import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { findMatches, MAX_MATCHES } from "./find-matches";

const found = (text: string, term: string) => findMatches(text, term).map((m) => text.slice(m.start, m.end));

describe("findMatches", () => {
  it("matches whole words only", () => {
    expect(found("Java and JavaScript and Javas", "Java")).toEqual(["Java"]);
  });

  it("ignores case and returns the text as written", () => {
    expect(found("python PYTHON Python", "Python")).toEqual(["python", "PYTHON", "Python"]);
  });

  it("finds a term split by a line break or extra whitespace", () => {
    expect(found("Project\nmanagement and project   management", "project management")).toHaveLength(2);
  });

  it.each(["C#", "C++", ".NET", "Node.js"])("finds the term %s with symbols", (term) => {
    expect(found(`I use ${term} daily, and ${term}.`, term)).toHaveLength(2);
  });

  it("finds CSS in HTML/CSS but not inside a longer word", () => {
    expect(found("HTML/CSS and SCSS", "CSS")).toEqual(["CSS"]);
  });

  it("finds nothing for an empty or whitespace term", () => {
    expect(findMatches("some text", "")).toEqual([]);
    expect(findMatches("some text", "  \n ")).toEqual([]);
  });

  it("trims the term", () => {
    expect(found("some text", "  text ")).toEqual(["text"]);
  });

  it("never throws on regex characters in the term", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (text, term) => {
        expect(() => findMatches(text, term)).not.toThrow();
      }),
    );
    expect(() => findMatches("a (b", "(")).not.toThrow();
    expect(() => findMatches("a [b", "[a-")).not.toThrow();
  });

  it("returns ordered, non-overlapping matches that equal the count", () => {
    const matches = findMatches("go go go", "go");
    expect(matches).toHaveLength(3);
    matches.forEach((m, i) => i > 0 && expect(m.start).toBeGreaterThanOrEqual(matches[i - 1]!.end));
  });

  it("caps the number of matches on a large text", () => {
    const text = "word ".repeat(200_000);
    expect(findMatches(text, "word").length).toBeLessThanOrEqual(MAX_MATCHES);
  });
});
