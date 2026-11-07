// Writes the prerendered pages (`src/prerender.tsx`, built to dist-ssr) into dist, each from
// dist/index.html with the page in `#app`. Run by `pnpm build`, after both Vite builds.
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { speculationRulesText } from "@jakoblui-works/shared-ui";

const root = path.join(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const ssrDir = path.join(root, "dist-ssr");

const { render } = await import(path.join(ssrDir, "prerender.js"));

const template = await readFile(path.join(dist, "index.html"), "utf8");
const placeholder = '<div id="app"></div>';
if (!template.includes(placeholder)) {
  console.error(`No ${placeholder} in dist/index.html to prerender into.`);
  process.exit(1);
}

// The title is HTML-escaped where it goes into `index.html`, so it is here too.
const notFoundTitle = "Page not found - Jakob Lui";

/** The 404 page's head: its own title, without the home page's description, canonical and previews. */
const notFoundHead = (html) =>
  html
    // A function, so `$` in the title isn't read as a replacement pattern.
    .replace(/<title>.*<\/title>/, () => `<title>${notFoundTitle}</title>`)
    .replace(/<meta\s+(?:name="description"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*/g, "")
    .replace(/<link rel="canonical"[^>]*>\s*/, "")
    .replace(/<!--[\s\S]*?-->\s*/g, "");

const pages = [
  { url: "/", file: "index.html", head: (html) => html },
  // Any path without a route renders the not-found page.
  { url: "/404", file: "404.html", head: notFoundHead },
];

// Marked with its URL: the app hydrates it there and replaces it anywhere else (`main.tsx`).
const written = [];
for (const { url, file, head } of pages) {
  const page = head(template).replace(
    placeholder,
    `<div id="app"><div data-prerendered="${url}">${await render(url)}</div></div>`,
  );
  await writeFile(path.join(dist, file), page);
  written.push(page);
}
await rm(ssrDir, { recursive: true });

// The Content-Security-Policy (the `csp` answer), with the hashes of every inline script in the
// pages added to `script-src`: the theme script and the router's hydration scripts, whose contents
// change between builds. Also the hash of the speculation rules shared-ui's `SiteHeader` inserts
// from JavaScript: Chromium ignores `'inline-speculation-rules'` when `script-src` has hashes, and
// the text comes from the installed shared-ui, so it matches what the header inserts. nginx sends
// it (`nginx.conf`, the Dockerfile copies it there).
const policy = "default-src \u0027self\u0027; script-src \u0027self\u0027 \u0027wasm-unsafe-eval\u0027; style-src \u0027self\u0027 \u0027unsafe-inline\u0027; img-src \u0027self\u0027 data: blob:; font-src \u0027self\u0027 data:; frame-src blob:; object-src \u0027none\u0027; base-uri \u0027none\u0027; form-action \u0027self\u0027; frame-ancestors \u0027none\u0027";
const inlineScripts = written.flatMap((page) =>
  [...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(([, attributes]) => !/\ssrc=/.test(attributes))
    .map(([, , body]) => body),
);
const hashes = [
  ...new Set(
    [...inlineScripts, speculationRulesText("ats")].map(
      (body) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`,
    ),
  ),
];
const withHashes = policy.replace(/(^|;)(\s*script-src)(?=\s)/, (_, start, directive) =>
  `${start}${directive} ${hashes.join(" ")}`,
);
const nginxDir = path.join(root, "dist-nginx");
await mkdir(nginxDir, { recursive: true });
await writeFile(
  path.join(nginxDir, "csp.conf"),
  `add_header Content-Security-Policy "${withHashes}" always;\n`,
);
