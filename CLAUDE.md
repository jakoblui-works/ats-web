# ats-web

Upload a CV as a PDF and see what a simple parser would extract from it. The parsing runs in the visitor's browser (a Python parser in a Web Worker, through Pyodide), so the CV never leaves the device. Served at ats.jakoblui.com. Made from `web-template` (Copier); `.copier-answers.yml` records the version.

## Commands
```sh
pnpm install
pnpm dev               # http://localhost:3000 (not prerendered)
pnpm lint
pnpm test              # Vitest: unit tests (jsdom) + Storybook stories in a Playwright browser
pnpm build             # fetches the parser assets, vite build, prerender, tsc --noEmit
pnpm preview           # serves dist/ (prerendered, but without nginx's 404 handling)
pnpm storybook         # :6006
pnpm fetch:parser      # fetch the parser assets into public/assets/pyodide-<hash>/ (also run by prebuild/predev/prestart)
pnpm generate:schema   # regenerate src/parser/generated/ (zod) from the fetched parser schema
copier update --trust  # pull template changes; commit first
```

## Stack
React 19, Vite, TanStack Router (file routes in `src/routes`; `routeTree.gen.ts` is generated), Tailwind 4, shadcn on Base UI (`src/components/ui`), zod, Storybook 10, Vitest. The parser is Python run by Pyodide in a Web Worker; no api, no server-side code. Served by nginx (`nginx.conf`; the Storybook image has its own, `nginx.storybook.conf`).

## Layout
- `src/routes/`: the pages. `__root.tsx` holds the 404 route; each page renders `AppHeader` itself.
- `src/components/`: one folder per component with its stories and tests, files named after it (no `index.tsx`, no barrels), grouped by feature once there are several (`components/<feature>/<name>/`). The stories' titles follow the folders (`<Feature>/<Name>`). `ui/` stays flat, since the shadcn CLI expects it.
- `src/components/app-header/app-header.tsx`: shared-ui's `SiteHeader` as this site shows it.
- `src/components/not-found-page/not-found-page.tsx`: the 404 page, with shared-ui's default `NotFound`. Draw the site's own here to replace it.
- `src/parser/`: the in-browser parser. `parser.worker.ts` is the Web Worker that loads Pyodide and the parser's wheel and runs it; `use-ats-parse.ts` (`useAtsParse`) drives it from React and gives the page its `loading` / `processing` / `done` / `failed` states. `generated/` holds the zod for the parser's output (never edit by hand; a test keeps it equal to a regeneration).
- `parser-assets.json`: the pin file: Pyodide's version, the wheels (URL + sha256; pdfminer.six is stripped of its CJK CMap tables), and the parser's wheel and JSON schema (ats-parser release URLs). `parser-stub/` is a stand-in for `cryptography`, which Pyodide would otherwise have to load for pdfminer.
- `scripts/fetch-parser-assets.mjs`: puts Pyodide (from the `pyodide` npm package), the wheels, the stand-in and the parser's wheel and schema into `public/assets/pyodide-<hash>/` (git-ignored) and writes `src/parser/parser-assets.gen.ts`. The site serves all of it itself, so no CDN or PyPI is hit at runtime. Downloads are checked against their sha256 and cached in `node_modules/.cache/parser-assets/`.
- `src/prerender.tsx` + `scripts/prerender.mjs`: prerendering. `src/router.tsx`: the router, shared by it and `main.tsx`.

## Prerendering and 404s
`pnpm build` renders `/` and the not-found page in Node and writes them into `dist/index.html` and `dist/404.html`, so crawlers get the text without running JavaScript. The browser hydrates a page on a URL that renders the same as the one it was rendered for, and replaces it anywhere else (`main.tsx`). nginx serves only real files and answers anything else with `404.html` and a 404 status.
- **Rendering must work in Node, and match the browser's first render.** Don't read `window` or `document` while rendering (effects are fine). A render error fails the build on purpose.
- **Heads are static,** in `index.html`, because previews and crawlers don't run JavaScript. `404.html`'s head is rewritten in `scripts/prerender.mjs`.

## The parser's assets
- Run by `prebuild`, `predev` and `prestart`, or by hand with `pnpm fetch:parser`.
- **`ATS_PARSER_DIST=<dir>`** uses a local parser build (its wheel and schema) instead of the pinned release (ats-parser `v0.1.0`).
- **Bumping the parser:** make a new ats-parser release, update the URLs and sha256 in `parser-assets.json`, run `pnpm fetch:parser`, then `pnpm generate:schema`, and fix what `tsc` flags.
- **Don't run two fetches at once** (this only happens in dev: run it again or restart `pnpm dev`).

## Gotchas
- **Installing needs a GitHub Packages token** for `@jakoblui-works/shared-ui`, even though it's public. CI uses `GITHUB_TOKEN` (shared-ui's package settings must give this repo read access, "Manage Actions access"); the Docker builds take it as `--secret id=npm_token,env=NODE_AUTH_TOKEN`.
- **The header, theme tokens and fonts come from shared-ui;** `styles.css` holds only this site's palette and CSS. A new site needs its entry in shared-ui's `sites.ts` first (`AppHeader`'s `current` is typed by it).
- **Template files:** keep this repo's own additions at least one line away from template lines, or every template change to those lines conflicts on `copier update`. `README.md`, `CLAUDE.md`, the home page, `app-header.tsx` and `not-found-page.tsx` are this repo's own after the first render; updates never touch them.
- **Deploys build two images** (`ats-web` and `ats-web-storybook`); storybook-host composes the Storybook.
- **Repo-root `robots.txt`** is Storybook's (disallow all). The site's is `public/robots.txt`.
