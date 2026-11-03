// The parser's worker: loads Pyodide and the parser's wheels from the site's own assets folder, then answers `parse`
// requests (see `protocol.ts`). Created with
// `new Worker(new URL("./parser.worker.ts", import.meta.url), { type: "module" })`.
//
// Nothing here may let text from Python or the PDF out: no message carries an error's text, Python's stdout and
// stderr go nowhere, and the worker's console is silenced (Pyodide logs some failures itself).
import type { PyodideAPI } from "pyodide";

import { parserAssets } from "./parser-assets";
import type { FromWorker, ToWorker } from "./protocol";

// The repo's types are the DOM's, not a worker's; this is the part of a worker's global scope used here.
type WorkerScope = {
  location: { href: string };
  postMessage: (message: FromWorker) => void;
  addEventListener: {
    (type: "message", listener: (event: MessageEvent<ToWorker>) => void): void;
    (type: "unhandledrejection", listener: (event: PromiseRejectionEvent) => void): void;
  };
};
const scope = self as unknown as WorkerScope;

const silent = () => {};
for (const method of ["log", "info", "warn", "error", "debug", "trace"] as const) console[method] = silent;
// Every promise below is handled; this keeps the browser from logging a missed one with its text.
scope.addEventListener("unhandledrejection", (event) => event.preventDefault());

type ParsePdfJson = ((pdf: Uint8Array) => string) & { destroy?: () => void };

const load = async (): Promise<ParsePdfJson> => {
  const { PARSER_ASSETS_PATH, PARSER_WHEELS } = parserAssets();
  const indexURL = new URL(PARSER_ASSETS_PATH, scope.location.href).href;

  // Pyodide's own module, from the assets folder rather than bundled, so its runtime files are fetched from there only.
  const { loadPyodide } = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as typeof import("pyodide");
  const wheels = Promise.all(
    PARSER_WHEELS.map(async (name) => {
      const response = await fetch(new URL(name, indexURL));
      if (!response.ok) throw new Error("wheel not found");
      return response.arrayBuffer();
    }),
  );
  // Keep the wheels' promise handled while Pyodide loads, so a failed download isn't reported before it's awaited.
  wheels.catch(silent);

  const pyodide: PyodideAPI = await loadPyodide({ indexURL, stdout: silent, stderr: silent, checkAPIVersion: true });
  pyodide.setStdout({ batched: silent });
  pyodide.setStderr({ batched: silent });

  // In order: the parser's dependencies first.
  for (const wheel of await wheels) pyodide.unpackArchive(new Uint8Array(wheel), "wheel");

  // `pdf` arrives as a JsProxy of the Uint8Array; the parser takes bytes.
  return pyodide.runPython(`
import ats_parser

def _parse_pdf_json(pdf):
    return ats_parser.parse_pdf_json(pdf.to_bytes())

_parse_pdf_json
`) as ParsePdfJson;
};

const loaded = load();

loaded.then(
  () => scope.postMessage({ type: "ready" }),
  () => scope.postMessage({ type: "load-failed" }),
);

scope.addEventListener("message", ({ data }) => {
  if (data?.type !== "parse") return;
  const { id, pdf } = data;
  loaded.then(
    (parsePdfJson) => {
      let json: unknown;
      try {
        json = parsePdfJson(new Uint8Array(pdf));
      } catch {
        scope.postMessage({ type: "parse-failed", id });
        return;
      }
      scope.postMessage(typeof json === "string" ? { type: "outcome", id, json } : { type: "parse-failed", id });
    },
    () => scope.postMessage({ type: "parse-failed", id }),
  );
});
