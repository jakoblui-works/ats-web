// The messages between the page and the parser's worker (`parser.worker.ts`). No message carries an error's text:
// a Python exception can quote the CV.

/** Page → worker: parse one PDF. Send `pdf` in the transfer list, so the page keeps no copy. */
export type ParseRequest = { type: "parse"; id: number; pdf: ArrayBuffer };

export type ToWorker = ParseRequest;

/** Worker → page. */
export type FromWorker =
  /** Pyodide, the wheels and the parser are loaded. */
  | { type: "ready" }
  /** Loading failed; the worker can't parse. */
  | { type: "load-failed" }
  /** What `parse_pdf_json` returned for request `id`: a `ParseOutcome` as JSON, not yet validated. */
  | { type: "outcome"; id: number; json: string }
  /** Python raised while parsing request `id`. */
  | { type: "parse-failed"; id: number };
