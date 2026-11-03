// Don't run two of these at once (dev only: if it happens, run it again or restart `pnpm dev`).
// Puts everything the in-browser CV parser needs into public/assets/pyodide-<hash>/, so the site serves it
// itself and nothing is loaded from a CDN or PyPI at runtime: Pyodide's core (from the `pyodide` package), the
// wheels pinned in parser-assets.json (pdfminer without its CJK CMap tables), the `cryptography` stand-in built
// from parser-stub/, and the parser's wheel and schema (pinned, or from ATS_PARSER_DIST=<dir>).
// Then writes src/parser/parser-assets.gen.ts with the folder's path. Run by `prebuild`, `predev` and
// `pnpm fetch:parser`. Downloads are checked against their sha256 and cached in node_modules/.cache/parser-assets/.
// Plain Node 22 (the Docker build's), no dependencies: a wheel is a zip, read and written here.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

const root = path.join(import.meta.dirname, "..");
const pinFile = path.join(root, "parser-assets.json");
const stubDir = path.join(root, "parser-stub");
const cacheDir = path.join(root, "node_modules/.cache/parser-assets");
const assetsDir = path.join(root, "public/assets");
const genModule = path.join(root, "src/parser/parser-assets.gen.ts");
const pyodideDir = path.join(root, "node_modules/pyodide");

const PYODIDE_FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
const SCHEMA_NAME = "parse_outcome.schema.json";
const STAND_IN = { name: "cryptography", version: "0.0.0" };

class AssetError extends Error {}
const fail = (message) => {
  throw new AssetError(message);
};

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// --- Zip ------------------------------------------------------------------------------------------------------
// Only what wheels need: stored or deflated entries, no zip64, no encryption.

/** Reads a zip's files (directories skipped) into a Map of name → bytes, checking each CRC. */
const readZip = (buffer, label) => {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail(`${label} is not a zip file.`);
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (count === 0xffff || offset === 0xffffffff) fail(`${label} is a zip64 file, which isn't supported.`);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) fail(`${label}: bad zip central directory.`);
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (flags & 1) fail(`${label}: ${name} is encrypted.`);
    if (name.endsWith("/")) continue;
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) fail(`${label}: bad zip local header for ${name}.`);
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const raw = buffer.subarray(start, start + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else fail(`${label}: ${name} uses zip method ${method}, which isn't supported.`);
    if (crc32(data) !== crc) fail(`${label}: CRC mismatch for ${name}.`);
    files.set(name, data);
  }
  return files;
};

/**
 * Writes files (name → bytes) as a deterministic zip: entries in name order, deflated at level 9, dated
 * 1980-01-01 00:00, mode 0644. The same files always give the same bytes (for a given Node's zlib).
 */
const writeZip = (files) => {
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of [...files.keys()].sort()) {
    const data = files.get(name);
    const nameBytes = Buffer.from(name, "utf8");
    const utf8Flag = /^[\x20-\x7e]*$/.test(name) ? 0 : 0x0800;
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(utf8Flag, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(utf8Flag, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // regular file, rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
};

// --- Wheels ---------------------------------------------------------------------------------------------------

/** A RECORD line's hash: urlsafe base64 of the sha256, unpadded (PEP 376/427). */
const recordHash = (data) => "sha256=" + createHash("sha256").update(data).digest("base64url");

/** Rewrites the wheel's RECORD to list exactly its files, then zips it deterministically. */
const packWheel = (files, label) => {
  const recordName = [...files.keys()].find((name) => /^[^/]+\.dist-info\/RECORD$/.test(name));
  if (!recordName) fail(`${label} has no .dist-info/RECORD.`);
  const lines = [...files.keys()]
    .filter((name) => name !== recordName)
    .sort()
    .map((name) => `${name},${recordHash(files.get(name))},${files.get(name).length}`);
  const record = [...lines, `${recordName},,`].join("\n") + "\n";
  return writeZip(new Map([...files, [recordName, Buffer.from(record)]]));
};

/** The wheel without the files under any of `prefixes`, with its RECORD to match. */
const stripWheel = (buffer, prefixes, label) => {
  const files = readZip(buffer, label);
  const kept = new Map([...files].filter(([name]) => !prefixes.some((prefix) => name.startsWith(prefix))));
  if (kept.size === files.size) fail(`${label}: nothing matched the strip rules ${JSON.stringify(prefixes)}.`);
  return packWheel(kept, label);
};

/** parser-stub/'s files, by their path in the wheel (posix, sorted). */
const readStub = async () => {
  const entries = await readdir(stubDir, { recursive: true, withFileTypes: true });
  const files = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".py")) continue;
    const full = path.join(entry.parentPath, entry.name);
    files.set(path.relative(stubDir, full).split(path.sep).join("/"), await readFile(full));
  }
  if (!files.has(`${STAND_IN.name}/__init__.py`)) fail(`No ${STAND_IN.name}/__init__.py in parser-stub/.`);
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
};

/** The `cryptography` stand-in as a wheel: parser-stub/'s files plus the metadata a wheel needs. */
const standInWheel = (stub) => {
  const distInfo = `${STAND_IN.name}-${STAND_IN.version}.dist-info`;
  const files = new Map(stub);
  files.set(
    `${distInfo}/METADATA`,
    Buffer.from(
      `Metadata-Version: 2.1\nName: ${STAND_IN.name}\nVersion: ${STAND_IN.version}\n` +
        "Summary: ats-web's stand-in for cryptography: lets pdfminer.six import; AES raises PDFEncryptionError\n",
    ),
  );
  files.set(
    `${distInfo}/WHEEL`,
    Buffer.from("Wheel-Version: 1.0\nGenerator: ats-web fetch-parser-assets\nRoot-Is-Purelib: true\nTag: py3-none-any\n"),
  );
  files.set(`${distInfo}/RECORD`, Buffer.alloc(0));
  return {
    name: `${STAND_IN.name}-${STAND_IN.version}-py3-none-any.whl`,
    data: packWheel(files, "the cryptography stand-in"),
  };
};

// --- Downloads ------------------------------------------------------------------------------------------------

const fileName = (url) => decodeURIComponent(new URL(url).pathname.split("/").pop());

const checkHash = (data, expected, label) => {
  const actual = sha256(data);
  if (actual !== expected) {
    fail(`sha256 mismatch for ${label}:\n  expected ${expected}\n  actual   ${actual}`);
  }
};

/** The pinned file, from the cache (re-checked) or downloaded into it. */
const fetchPinned = async ({ url, sha256: expected }) => {
  const name = fileName(url);
  if (!/^[0-9a-f]{64}$/.test(expected ?? "")) fail(`parser-assets.json: ${name} has no valid sha256.`);
  const cached = path.join(cacheDir, expected);
  if (existsSync(cached)) {
    const data = await readFile(cached);
    if (sha256(data) === expected) return { name, data };
    await rm(cached, { force: true });
  }
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    fail(`Couldn't download ${name} from ${url}: ${error.cause?.message ?? error.message}`);
  }
  if (!response.ok) fail(`Couldn't download ${name} from ${url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  checkHash(data, expected, `${name} (${url})`);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cached, data); // if cut short, the next run's check catches it
  return { name, data };
};

/** The parser's wheel and schema: from ATS_PARSER_DIST if set, else the pinned release. */
const parserFiles = async (pins) => {
  const dist = process.env.ATS_PARSER_DIST;
  if (dist) {
    const dir = path.resolve(process.env.INIT_CWD ?? process.cwd(), dist);
    const names = existsSync(dir) ? await readdir(dir) : [];
    const wheels = names.filter((name) => /^ats_parser-.*\.whl$/.test(name));
    if (wheels.length !== 1 || !names.includes(SCHEMA_NAME)) {
      fail(`ATS_PARSER_DIST=${dist} must hold one ats_parser-*.whl and ${SCHEMA_NAME}.`);
    }
    return {
      wheel: { name: wheels[0], data: await readFile(path.join(dir, wheels[0])) },
      schema: { name: SCHEMA_NAME, data: await readFile(path.join(dir, SCHEMA_NAME)) },
    };
  }
  if (pins.parser.wheel.sha256 === null || pins.parser.schema.sha256 === null) {
    fail(
      "parser-assets.json: the parser's sha256 is null (its release isn't pinned yet). " +
        "Set ATS_PARSER_DIST=<dir> to a folder with one ats_parser-*.whl and parse_outcome.schema.json.",
    );
  }
  const wheel = await fetchPinned(pins.parser.wheel);
  const schema = await fetchPinned(pins.parser.schema);
  if (schema.name !== SCHEMA_NAME) fail(`parser-assets.json: the parser's schema must be named ${SCHEMA_NAME}.`);
  return { wheel, schema };
};

// --- Main -----------------------------------------------------------------------------------------------------

const main = async () => {
  const pins = JSON.parse(await readFile(pinFile, "utf8"));

  const declared = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).dependencies?.pyodide;
  if (!existsSync(pyodideDir)) fail("The pyodide package isn't installed; run `pnpm install`.");
  const installed = JSON.parse(await readFile(path.join(pyodideDir, "package.json"), "utf8")).version;
  if (pins.pyodide !== declared || pins.pyodide !== installed) {
    fail(
      `parser-assets.json pins pyodide ${pins.pyodide}, but package.json depends on ${declared} ` +
        `and ${installed} is installed. They must be the same exact version.`,
    );
  }

  const wheels = [];
  for (const pin of pins.wheels) {
    const { name, data } = await fetchPinned(pin);
    wheels.push({ name, data: pin.strip?.length ? stripWheel(data, pin.strip, name) : data });
  }
  const stub = await readStub();
  const standIn = standInWheel(stub);
  const parser = await parserFiles(pins);

  // Everything that decides the folder's files, so a change to any of them gives a new path.
  const inputs = {
    pins: { pyodide: pins.pyodide, wheels: pins.wheels },
    stub: [...stub].map(([name, data]) => [name, sha256(data)]),
    parser: { wheel: [parser.wheel.name, sha256(parser.wheel.data)], schema: sha256(parser.schema.data) },
    script: sha256(await readFile(import.meta.filename)),
  };
  const hash = sha256(JSON.stringify(inputs)).slice(0, 12);
  const folder = `pyodide-${hash}`;
  const outDir = path.join(assetsDir, folder);

  // The folder is only ever made by renaming a complete one into place, and its name is decided by its contents,
  // so one that exists is already right. It's written in the cache, outside public/, and renamed across.
  const installOrder = [...wheels, standIn, parser.wheel];
  if (!existsSync(outDir)) {
    const partial = path.join(cacheDir, "partial");
    await rm(partial, { recursive: true, force: true });
    await mkdir(partial, { recursive: true });
    for (const name of PYODIDE_FILES) {
      await writeFile(path.join(partial, name), await readFile(path.join(pyodideDir, name)));
    }
    for (const { name, data } of [...installOrder, parser.schema]) {
      await writeFile(path.join(partial, name), data);
    }
    await mkdir(assetsDir, { recursive: true });
    await rename(partial, outDir);
  }

  // Written before older folders are removed, so it never names a deleted one.
  await mkdir(path.dirname(genModule), { recursive: true });
  await writeFile(
    genModule,
    `// Written by scripts/fetch-parser-assets.mjs (\`pnpm fetch:parser\`); never edit by hand.

/** Where the parser's files are served: Pyodide's core, the wheels and the schema. */
export const PARSER_ASSETS_PATH = "/assets/${folder}/";

/** The wheels in that folder; install all of them before importing the parser. */
export const PARSER_WHEELS = ${JSON.stringify(
      installOrder.map(({ name }) => name),
      null,
      2,
    )} as const;

/** The parser's JSON schema in that folder. */
export const PARSER_SCHEMA = "${SCHEMA_NAME}";
`,
  );

  // Older folders go.
  for (const entry of await readdir(assetsDir)) {
    if (/^pyodide-/.test(entry) && entry !== folder) {
      await rm(path.join(assetsDir, entry), { recursive: true, force: true });
    }
  }

  const source = process.env.ATS_PARSER_DIST ? `ATS_PARSER_DIST=${process.env.ATS_PARSER_DIST}` : "the pinned release";
  console.log(`Parser assets in public/assets/${folder}/ (parser from ${source}).`);
};

try {
  await main();
} catch (error) {
  if (!(error instanceof AssetError)) throw error;
  console.error(`fetch-parser-assets: ${error.message}`);
  process.exit(1);
}
