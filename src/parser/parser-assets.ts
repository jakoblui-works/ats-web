// Where the parser's files are served. `scripts/fetch-parser-assets.mjs` (`pnpm fetch:parser`, run before
// `pnpm build` and `pnpm dev`) writes them and `parser-assets.gen.ts`, which names their folder. It's read through
// a glob so anything that bundles this without it (Storybook, Vitest) still builds, and fails only here, clearly.

export type ParserAssets = {
  /** The folder, e.g. `/assets/pyodide-<hash>/`: Pyodide's core, the wheels and the schema. */
  PARSER_ASSETS_PATH: string;
  /** The wheels in that folder; install all of them before importing the parser. */
  PARSER_WHEELS: readonly string[];
  /** The parser's JSON schema in that folder. */
  PARSER_SCHEMA: string;
};

const generated = import.meta.glob<ParserAssets>("./parser-assets.gen.ts", { eager: true });

export const parserAssets = (): ParserAssets => {
  const assets = generated["./parser-assets.gen.ts"];
  if (!assets) throw new Error("src/parser/parser-assets.gen.ts is missing: run `pnpm fetch:parser`.");
  return assets;
};
