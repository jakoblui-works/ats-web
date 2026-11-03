// Drift check (Group C2): the committed zod in src/parser/generated/parse-outcome.ts must be exactly what
// `pnpm generate:schema` makes from the fetched schema. `generate:schema` writes in place, so it runs in a copy of the
// repo (node_modules linked), and the copy's output is compared with the committed file.
import { afterAll, expect, it } from "vitest";

// The repo has no Node types (`tsc --noEmit` checks src/ for the browser), so Node's modules are loaded by name, untyped.
const nodeModule = (name: string) => import(/* @vite-ignore */ name);

const GENERATED = "src/parser/generated/parse-outcome.ts";
const SKIP = new Set(["node_modules", "dist", "dist-ssr", ".git", "storybook-static"]);

let cleanup = () => {};
afterAll(() => cleanup());

it(
  "the committed parse-outcome.ts equals a regeneration from the fetched schema",
  async () => {
    const fs = await nodeModule("node:fs");
    const os = await nodeModule("node:os");
    const path = await nodeModule("node:path");
    const { execFileSync } = await nodeModule("node:child_process");
    const { fileURLToPath } = await nodeModule("node:url");

    const root: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const assets = path.join(root, "public/assets");
    const fetched = fs.existsSync(assets)
      ? fs
          .readdirSync(assets)
          .filter(
            (name: string) =>
              /^pyodide-/.test(name) && fs.existsSync(path.join(assets, name, "parse_outcome.schema.json")),
          )
      : [];
    expect(fetched, "no fetched parse_outcome.schema.json in public/assets/pyodide-*/: run `pnpm fetch:parser` first").toHaveLength(1);
    expect(fs.existsSync(path.join(root, GENERATED)), `${GENERATED} isn't committed`).toBe(true);

    const temp: string = fs.mkdtempSync(path.join(os.tmpdir(), "ats-web-schema-"));
    cleanup = () => fs.rmSync(temp, { recursive: true, force: true });
    const copy = path.join(temp, "repo");
    fs.cpSync(root, copy, {
      recursive: true,
      filter: (source: string) => !SKIP.has(path.relative(root, source).split(path.sep)[0]),
    });
    fs.symlinkSync(path.join(root, "node_modules"), path.join(copy, "node_modules"), "dir");
    // So a generator that writes nothing can't pass.
    fs.rmSync(path.join(copy, GENERATED));

    execFileSync("pnpm", ["run", "--silent", "generate:schema"], { cwd: copy, stdio: "pipe" });

    expect(fs.existsSync(path.join(copy, GENERATED)), `pnpm generate:schema didn't write ${GENERATED}`).toBe(true);
    const regenerated: string = fs.readFileSync(path.join(copy, GENERATED), "utf8");
    const committed: string = fs.readFileSync(path.join(root, GENERATED), "utf8");
    expect(regenerated, `${GENERATED} differs from a fresh \`pnpm generate:schema\`: regenerate it`).toBe(committed);
  },
  120_000,
);
