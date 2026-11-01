import { render, screen } from "@testing-library/react";
import { userEvent } from "storybook/test";
import { describe, expect, it } from "vitest";

import { TextSearch } from "./text-search";

const search = async (text: string, term: string) => {
  render(<TextSearch text={text} />);
  await userEvent.type(screen.getByRole("searchbox"), term);
};

describe("TextSearch", () => {
  it("says nothing before a term is typed", () => {
    render(<TextSearch text="Python" />);
    expect(screen.getByTestId("search-result")).toBeEmptyDOMElement();
  });

  it("counts matches and marks them", async () => {
    await search("Python, python and Java", "python");
    expect(screen.getByTestId("search-result")).toHaveTextContent("A simple parser would find this: 2 matches");
    expect(document.querySelectorAll("mark")).toHaveLength(2);
  });

  it("uses the singular for one match", async () => {
    await search("Python and Java", "java");
    expect(screen.getByTestId("search-result")).toHaveTextContent("this: 1 match");
  });

  it("says a simple parser wouldn't find a missing term", async () => {
    await search("Python", "Rust");
    expect(screen.getByTestId("search-result")).toHaveTextContent("A simple parser wouldn't find this");
    expect(document.querySelectorAll("mark")).toHaveLength(0);
  });

  it("renders HTML in the text as text, split around marks", async () => {
    await search('<img src=x onerror="alert(1)"> hello <b>hi</b>', "hello");
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
    expect(document.querySelector("mark")).toHaveTextContent("hello");
    expect(document.querySelector("pre")).toHaveTextContent('<img src=x onerror="alert(1)"> hello <b>hi</b>');
  });
});
