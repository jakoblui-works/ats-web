// `pnpm generate:schema`: turns the parser's JSON schema (parse_outcome.schema.json, fetched into
// public/assets/pyodide-<hash>/ by `pnpm fetch:parser`) into src/parser/generated/parse-outcome.ts, a zod schema with
// its static types. The output is committed; a test checks it equals a fresh run.
//
// It supports only the JSON Schema the parser publishes (pydantic's, for dataclasses) and fails on anything else, so a
// new keyword can't be dropped silently: objects with every property listed and `additionalProperties: false`
// (→ `z.strictObject`), required and optional properties, `anyOf` (with `null` → `.nullable()`), string `enum`s,
// `const`s, strings, integers, booleans, numbers, arrays and `$ref`s into `$defs`. Annotations (`title`,
// `description`, `$schema`) are ignored. Zod 4's own `z.fromJSONSchema` builds a schema only at runtime, typed as a
// plain `ZodType`, so it can't give a committed file or the parser's types.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public/assets");
const SCHEMA_NAME = "parse_outcome.schema.json";
const OUTPUT = path.join(ROOT, "src/parser/generated/parse-outcome.ts");

const ANNOTATIONS = new Set(["title", "description", "$schema"]);

const fail = (message) => {
  console.error(`generate:schema: ${message}`);
  process.exit(1);
};

const findSchema = () => {
  const folders = existsSync(ASSETS)
    ? readdirSync(ASSETS).filter((name) => name.startsWith("pyodide-") && existsSync(path.join(ASSETS, name, SCHEMA_NAME)))
    : [];
  if (folders.length !== 1) {
    fail(`expected one public/assets/pyodide-*/${SCHEMA_NAME}, found ${folders.length}: run \`pnpm fetch:parser\` first.`);
  }
  return path.join(ASSETS, folders[0], SCHEMA_NAME);
};

/** `ParseResult` → `parseResultSchema`. */
const schemaName = (name) => `${name[0].toLowerCase()}${name.slice(1)}Schema`;

const checkKeys = (node, allowed, where) => {
  for (const key of Object.keys(node)) {
    if (!allowed.includes(key) && !ANNOTATIONS.has(key)) fail(`unsupported keyword "${key}" at ${where}.`);
  }
};

const refName = (ref, where) => {
  const match = /^#\/\$defs\/([A-Za-z_][A-Za-z0-9_]*)$/.exec(ref);
  if (!match) fail(`unsupported $ref "${ref}" at ${where}.`);
  return match[1];
};

const isNull = (node) => node && typeof node === "object" && node.type === "null" && Object.keys(node).every((k) => k === "type" || ANNOTATIONS.has(k));

const indent = (text, by = "  ") => text.replaceAll("\n", `\n${by}`);

/** The zod expression for one schema node. `refs` collects the `$defs` it uses. */
const toZod = (node, where, refs) => {
  if (typeof node !== "object" || node === null || Array.isArray(node)) fail(`unsupported schema at ${where}.`);

  if ("$ref" in node) {
    checkKeys(node, ["$ref"], where);
    const name = refName(node.$ref, where);
    refs.add(name);
    return schemaName(name);
  }

  if ("anyOf" in node) {
    checkKeys(node, ["anyOf"], where);
    const options = node.anyOf;
    if (!Array.isArray(options) || options.length === 0) fail(`empty anyOf at ${where}.`);
    const nonNull = options.filter((option) => !isNull(option));
    const nullable = nonNull.length < options.length;
    if (nullable && options.length - nonNull.length > 1) fail(`more than one null in anyOf at ${where}.`);
    if (nonNull.length === 0) return "z.null()";
    const parts = nonNull.map((option) => toZod(option, `${where}.anyOf[${options.indexOf(option)}]`, refs));
    const base = parts.length === 1 ? parts[0] : `z.union([\n  ${parts.map((p) => indent(p)).join(",\n  ")},\n])`;
    return nullable ? `${base}.nullable()` : base;
  }

  if ("const" in node) {
    checkKeys(node, ["const", "type"], where);
    const value = node.const;
    if (!["string", "number", "boolean"].includes(typeof value)) fail(`unsupported const at ${where}.`);
    if (node.type !== undefined && node.type !== typeof value && !(node.type === "integer" && Number.isInteger(value))) {
      fail(`const and type disagree at ${where}.`);
    }
    return `z.literal(${JSON.stringify(value)})`;
  }

  if ("enum" in node) {
    checkKeys(node, ["enum", "type"], where);
    if (node.type !== "string" || !Array.isArray(node.enum) || node.enum.length === 0) fail(`unsupported enum at ${where}.`);
    if (!node.enum.every((value) => typeof value === "string")) fail(`non-string enum value at ${where}.`);
    return `z.enum([${node.enum.map((value) => JSON.stringify(value)).join(", ")}])`;
  }

  switch (node.type) {
    case "string":
      checkKeys(node, ["type"], where);
      return "z.string()";
    case "integer":
      checkKeys(node, ["type"], where);
      return "z.int()";
    case "number":
      checkKeys(node, ["type"], where);
      return "z.number()";
    case "boolean":
      checkKeys(node, ["type"], where);
      return "z.boolean()";
    case "null":
      checkKeys(node, ["type"], where);
      return "z.null()";
    case "array":
      checkKeys(node, ["type", "items"], where);
      if (!("items" in node)) fail(`array without items at ${where}.`);
      return `z.array(${toZod(node.items, `${where}.items`, refs)})`;
    case "object": {
      checkKeys(node, ["type", "properties", "required", "additionalProperties"], where);
      if (node.additionalProperties !== false) fail(`object without additionalProperties: false at ${where}.`);
      const properties = node.properties ?? {};
      const required = node.required ?? [];
      for (const name of required) if (!(name in properties)) fail(`required "${name}" isn't a property at ${where}.`);
      const fields = Object.entries(properties).map(([name, property]) => {
        const zod = toZod(property, `${where}.properties.${name}`, refs);
        const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
        return `${key}: ${required.includes(name) ? zod : `${zod}.optional()`}`;
      });
      if (fields.length === 0) return "z.strictObject({})";
      return `z.strictObject({\n  ${fields.map((field) => indent(field)).join(",\n  ")},\n})`;
    }
    default:
      fail(`unsupported type ${JSON.stringify(node.type)} at ${where}.`);
  }
};

const generate = (schemaPath) => {
  const source = readFileSync(schemaPath);
  const schema = JSON.parse(source.toString("utf8"));
  const { $defs = {}, ...root } = schema;
  if (typeof root.title !== "string" || !/^[A-Z][A-Za-z0-9]*$/.test(root.title)) fail("the schema's root needs a PascalCase title.");
  if (root.title in $defs) fail(`the root's title "${root.title}" is also a $def.`);

  // Each definition after the ones it uses, so every const is declared before it's read. Ties keep the schema's order.
  const definitions = new Map();
  for (const [name, node] of Object.entries($defs)) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) fail(`unsupported $defs name "${name}".`);
    const refs = new Set();
    definitions.set(name, { zod: toZod(node, `$defs.${name}`, refs), refs });
  }
  const rootRefs = new Set();
  const rootZod = toZod(root, "(root)", rootRefs);
  for (const [name, { refs }] of [...definitions, [root.title, { refs: rootRefs }]]) {
    for (const ref of refs) if (!definitions.has(ref)) fail(`${name} refers to an undefined $def "${ref}".`);
  }

  const ordered = [];
  const state = new Map(); // name → "visiting" | "done"
  const visit = (name) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "visiting") fail(`recursive $defs ("${name}") aren't supported.`);
    state.set(name, "visiting");
    for (const ref of definitions.get(name).refs) visit(ref);
    state.set(name, "done");
    ordered.push(name);
  };
  for (const name of definitions.keys()) visit(name);

  const block = (name, zod) =>
    `export const ${schemaName(name)} = ${zod};\nexport type ${name} = z.infer<typeof ${schemaName(name)}>;\n`;

  const sha256 = createHash("sha256").update(source).digest("hex");
  return [
    "// Generated by `pnpm generate:schema` (scripts/generate-parse-outcome.mjs) from the parser's",
    `// ${SCHEMA_NAME} (sha256 ${sha256}), as \`pnpm fetch:parser\` fetched it into`,
    "// public/assets/pyodide-<hash>/. Never edit by hand: run `pnpm fetch:parser`, then `pnpm generate:schema`.",
    'import { z } from "zod";',
    "",
    ...ordered.map((name) => block(name, definitions.get(name).zod)),
    block(root.title, rootZod),
  ].join("\n");
};

const output = generate(findSchema());
mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, output);
console.log(`Wrote ${path.relative(ROOT, OUTPUT)}.`);
