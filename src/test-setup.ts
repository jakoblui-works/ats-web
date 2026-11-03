import "@testing-library/jest-dom/vitest";

// jsdom has no `matchMedia`, and the home page's `useMediaQuery` reads it.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;

// Nor `ResizeObserver`, which `useMoreBelow` uses. jsdom has no layout, so nothing would ever change size anyway.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
