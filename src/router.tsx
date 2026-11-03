import { createRouter as createTanstackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

// Shared by the browser (`main.tsx`) and the prerender (`prerender.tsx`), so the page hydrates
// against the same router it was rendered with.
export const createRouter = () => {
  return createTanstackRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
  });
};

// Register things for typesafety
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
