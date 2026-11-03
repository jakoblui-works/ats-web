// Contract check (Group C2): the generated zod accepts every outcome the native parser produced for the invented
// samples (platform-docs/ats/browser/spike/baseline/*.json, beside this repo), so the schema the page validates with
// and the parser's real output agree. On failure only the file and the path of each failing field are shown, never
// the outcome's content.
//
// The baseline lives in the private platform-docs, not in this repo. Set ATS_BASELINE_DIR to point elsewhere. Where
// it's missing, the test fails, except in CI (CI is set), where platform-docs is never checked out and it's skipped.
import { describe, expect, it } from "vitest";

// Loaded by name and path, untyped: the repo has no Node types, and the generated module may not exist yet.
const load = (specifier: string) => import(/* @vite-ignore */ specifier);
type Issue = { path: PropertyKey[]; code: string; errors?: Issue[][] };
type SafeParse = (value: unknown) => { success: boolean; error?: { issues: Issue[] } };

/** Where each issue is, without its message or the value (zod's messages can quote what they received). A union's
 * issue lists each alternative's issues under it. */
const places = (issues: Issue[], prefix: PropertyKey[] = []): string[] =>
  issues.flatMap((issue) => {
    const at = [...prefix, ...issue.path];
    const here = `${at.map(String).join(".") || "(root)"} [${issue.code}]`;
    return issue.errors?.length ? issue.errors.flatMap((alternative, i) => places(alternative, [...at, `alt${i}`])) : [here];
  });

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

describe("parseOutcomeSchema against the native parser's baseline", () => {
  it.skipIf(Boolean(env.CI))("accepts every outcome in spike/baseline/*.json", async () => {
    const fs = await load("node:fs");
    const path = await load("node:path");
    const { fileURLToPath } = await load("node:url");
    const root: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const dir: string = env.ATS_BASELINE_DIR ?? path.resolve(root, "../platform-docs/ats/browser/spike/baseline");
    expect(fs.existsSync(dir), `no baseline at ${dir}: set ATS_BASELINE_DIR`).toBe(true);

    const { parseOutcomeSchema } = (await load("./generated/parse-outcome")) as { parseOutcomeSchema: { safeParse: SafeParse } };
    // meta.json describes the run, not an outcome.
    const files = (fs.readdirSync(dir) as string[]).filter((f) => f.endsWith(".json") && f !== "meta.json").sort();
    expect(files.length, "no outcomes in the baseline").toBeGreaterThan(0);

    const rejected: string[] = [];
    for (const file of files) {
      const outcome: unknown = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const parsed = parseOutcomeSchema.safeParse(outcome);
      if (!parsed.success) {
        const where = places(parsed.error?.issues ?? []);
        rejected.push(`${file}: ${where.join(", ") || "rejected"}`);
      }
    }
    expect(rejected, `rejected ${rejected.length} of ${files.length} baseline outcomes`).toEqual([]);
  });
});
