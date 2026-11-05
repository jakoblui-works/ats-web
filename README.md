# ats-web

See what a simple ATS would extract from your CV. The CV is parsed in your browser (a Python parser in a Web Worker, through Pyodide) and never leaves your device.

The frontend at [ats.jakoblui.com](https://ats.jakoblui.com), made from [web-template](https://github.com/jakoblui-works/web-template). The header, theme and 404 content come from [shared-ui](https://github.com/jakoblui-works/shared-ui).

## Development
Installing needs a GitHub token with `read:packages` for `@jakoblui-works/shared-ui`, even though it's public: `pnpm config set "//npm.pkg.github.com/:_authToken" <token>`.
```sh
pnpm install
pnpm dev               # http://localhost:3000 (not prerendered)
pnpm lint
pnpm test
pnpm build             # prerendered, in dist/
pnpm storybook         # :6006
pnpm fetch:parser      # the parser assets; also run before build and dev
pnpm generate:schema   # the zod in src/parser/generated/ (never edit by hand)
```

## The parser
The parser is Python, run in a Web Worker by Pyodide (`src/parser/parser.worker.ts`, driven by `useAtsParse` in `src/parser/use-ats-parse.ts`). `scripts/fetch-parser-assets.mjs` fetches what it needs into `public/assets/pyodide-<hash>/`, as pinned in `parser-assets.json`: Pyodide, the wheels, a stand-in for `cryptography` (`parser-stub/`) and the parser's wheel and schema from an [ats-parser](https://github.com/jakoblui-works/ats-parser) release. This runs before `pnpm build` and `pnpm dev`, or by hand with `pnpm fetch:parser`.

- `ATS_PARSER_DIST=<dir>` uses a local parser build instead of the pinned release (ats-parser `v0.2.0`).
- To bump the parser: release it, update the URLs and sha256 in `parser-assets.json`, run `pnpm fetch:parser` and `pnpm generate:schema`, and fix what `tsc` flags.
- Don't run two fetches at once (dev only: run it again or restart).

## Template updates
```sh
copier update --trust
```
Commit everything first, then review the result as an ordinary diff. A conflict in `pnpm-lock.yaml` is resolved by running `pnpm install`.
