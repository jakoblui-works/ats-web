# ats-web

Upload a CV as a PDF and see what a simple parser would extract from it. The parser runs in the visitor's browser (Python in a Web Worker, through Pyodide), so the CV never leaves the device. Served at ats.jakoblui.com. Made from `web-template` (Copier); `.copier-answers.yml` records the version.

## Commands
```sh
pnpm install
pnpm dev               # http://localhost:3000 (not prerendered)
pnpm lint
pnpm test              # Vitest: unit tests (jsdom) + Storybook stories in a Playwright browser
pnpm build             # fetches the parser assets, vite build, prerender, tsc --noEmit
pnpm preview           # serves dist/ (prerendered, but without nginx's 404 handling)
pnpm storybook         # :6006
pnpm og                # with Storybook running: screenshot the OgCard story to public/og.png
pnpm fetch:parser      # fetch the parser assets into public/assets/pyodide-<hash>/ (prebuild/predev/prestart run it)
pnpm generate:schema   # regenerate src/parser/generated/ from the fetched parser schema
copier update --trust  # pull template changes; commit first
```

## Layout
- `src/routes/`: the pages, as file routes (`routeTree.gen.ts` is generated). `__root.tsx` holds the 404 route; each page renders `AppHeader` itself.
- `src/components/`: one folder per component with its stories and tests, files named after it (no `index.tsx`, no barrels), grouped by feature once there are several (`components/<feature>/<name>/`). The stories' titles follow the folders (`<Feature>/<Name>`). `ui/` (shadcn) stays flat, since the shadcn CLI expects it.
- `src/components/app-header/app-header.tsx`: shared-ui's `SiteHeader` as this site shows it.
- `src/components/not-found-page/not-found-page.tsx`: the 404 page, with shared-ui's default `NotFound`. Draw the site's own here to replace it.
- `src/parser/`: the in-browser parser: `parser.worker.ts` (the worker), `use-ats-parse.ts` (the React hook), `generated/` (zod for the parser's output).
- `parser-assets.json`: the pins for Pyodide, the wheels and the parser release. `parser-stub/`: stand-in for `cryptography`. `scripts/fetch-parser-assets.mjs`: builds `public/assets/pyodide-<hash>/` (git-ignored).
- `src/prerender.tsx` + `scripts/prerender.mjs`: prerendering. `src/router.tsx`: the router, shared by it and `main.tsx`.
- `Dockerfile` + `nginx.conf`: the site image. `Dockerfile.storybook` + `nginx.storybook.conf`: the Storybook image, which storybook-host composes. Deploys build both.

## Prerendering and 404s
`pnpm build` renders `/` and the not-found page into `dist/index.html` and `dist/404.html`.
- **Rendering must work in Node and match the browser's first render.** Don't read `window` or `document` while rendering (effects are fine). A render error fails the build on purpose.
- **nginx serves only real files** (`try_files $uri $uri/ =404`): a route without a prerendered file in `scripts/prerender.mjs`'s `pages` is served `404.html` with a 404 status, though it still renders client-side.
- **Heads are static,** in `index.html`. `404.html`'s head is rewritten in `scripts/prerender.mjs`.
- **The site-transition head script** in `index.html` takes its names from shared-ui; `src/site-transition-head-script.test.ts` checks them.

## The parser
- **Self-served:** the parser's assets come from the site, never a CDN or PyPI at runtime.
- **`ATS_PARSER_DIST=<dir>`** makes `pnpm fetch:parser` use a local parser build instead of the pinned release.
- **Bumping the parser:** new ats-parser release, then its URLs and sha256 in `parser-assets.json`, `pnpm fetch:parser`, `pnpm generate:schema`, and fix what `tsc` flags.
- **Never edit `src/parser/generated/` by hand;** a test keeps it equal to a regeneration.
- **Don't run two fetches at once** (dev only: run it again or restart `pnpm dev`).
- **zod runs `jitless`,** from `src/parser/zod-config.ts`, imported before any schema.

## Gotchas
- **Installing needs a GitHub Packages token** for `@jakoblui-works/shared-ui`, even though it's public. CI uses `GITHUB_TOKEN`: shared-ui's package settings must give this repo read access ("Manage Actions access"). The Docker builds take it as `--secret id=npm_token,env=NODE_AUTH_TOKEN`.
- **The header, theme tokens and fonts come from shared-ui;** `styles.css` holds only this site's palette and CSS. A new site needs its entry in shared-ui's `sites.ts` first (`AppHeader`'s `current` is typed by it), with the same palette as `styles.css`.
- **The CSP** is web-template's `csp` answer; change it with `copier update --trust --data csp="…"`. The browser enforces that nothing reaches a third party, so don't widen it for a CDN or analytics (Vite inlines fonts as `data:`, hence `font-src data:`). `pnpm dev` and `pnpm preview` send no policy: check it in the Docker image.
- **Template files:** keep this repo's own additions at least one line away from template lines, or every template change to those lines conflicts on `copier update`. `README.md`, `CLAUDE.md`, `src/routes/index.tsx`, `src/components/app-header/app-header.tsx`, `src/components/not-found-page/not-found-page.tsx` and `public/sitemap.xml` are this repo's own after the first render; updates never touch them.
- **Repo-root `robots.txt`** is Storybook's (disallow all). The site's is `public/robots.txt`.
