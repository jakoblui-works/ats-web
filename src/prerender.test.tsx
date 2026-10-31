import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "./prerender";

// The build renders the pages in Node, where there is no browser. The unit tests run in jsdom, so
// the browser's globals are taken away: a component reading `window` or `document` while
// rendering then throws here, as it would fail `pnpm build`.
const renderWithoutBrowser = async (url: string) => {
  vi.stubGlobal("window", undefined);
  vi.stubGlobal("document", undefined);
  try {
    return await render(url);
  } finally {
    vi.unstubAllGlobals();
  }
};

describe("prerendering", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each(["/", "/no-such-page"])("renders %s without a window or a document", async (url) => {
    const html = await renderWithoutBrowser(url);
    expect(html.length).toBeGreaterThan(0);
  });

  it("puts what the page does, and its one upload button, in the home page for crawlers", async () => {
    const html = await renderWithoutBrowser("/");
    document.body.innerHTML = html;
    expect(screen.getAllByText(/simple parser/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Upload CV" })).toBeInTheDocument();
  });
});
