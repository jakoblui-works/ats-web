// Group C3: the hook creates its worker when the home page mounts, never while the build prerenders it. Node has no
// `Worker` (and no window or document, as in src/prerender.test.tsx), so the pages are rendered with those globals
// taken away: creating a worker during rendering would throw, and fail the build.
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "../prerender";

const renderWithout = async (url: string, worker: unknown) => {
  vi.stubGlobal("window", undefined);
  vi.stubGlobal("document", undefined);
  vi.stubGlobal("Worker", worker);
  try {
    return await render(url);
  } finally {
    vi.unstubAllGlobals();
  }
};

describe("prerendering the pages that use the parser", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["/", "/no-such-page"])("renders %s with no Worker global", async (url) => {
    const html = await renderWithout(url, undefined);
    expect(html.length).toBeGreaterThan(0);
  });

  it("creates no worker while rendering the home page", async () => {
    let created = 0;
    class CountingWorker {
      constructor() {
        created++;
      }
      postMessage() {}
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
    }
    await renderWithout("/", CountingWorker);
    expect(created).toBe(0);
  });
});
