import { useEffect, useRef, useState } from "react";

import { looksLikePdf } from "@/lib/pdf";
import { parseOutcomeSchema, type ParseOutcome, type ParseResult } from "@/parser/generated/parse-outcome";
import type { FromWorker, ParseRequest } from "@/parser/protocol";

/** The largest file the page sends to the parser. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** How long a worker may take to load Pyodide and the parser, from its creation. */
export const STARTUP_TIMEOUT_MS = 60 * 1000;

/** How long one parse may take, from sending it to the worker. */
export const PARSE_TIMEOUT_MS = 30 * 1000;

export type AtsFailureReason =
  | "too-large"
  | "not-pdf"
  | "too-many-pages"
  | "encrypted"
  | "corrupt"
  | "timed-out"
  | "error";

export type AtsParse =
  /** A file is waiting for the worker to be ready. */
  | { status: "loading" }
  | { status: "processing" }
  | { status: "done"; result: ParseResult }
  | { status: "failed"; reason: AtsFailureReason };

const createParserWorker = (): Worker =>
  new Worker(new URL("./parser.worker.ts", import.meta.url), { type: "module" });

const REJECTION_REASONS: Record<Extract<ParseOutcome, { outcome: "rejected" }>["reason"], AtsFailureReason> = {
  too_many_pages: "too-many-pages",
  encrypted: "encrypted",
  corrupt: "corrupt",
  timed_out: "timed-out",
};

/** What the page shows for the worker's reply: anything that isn't a valid outcome is an error. */
const toParse = (json: string): AtsParse => {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { status: "failed", reason: "error" };
  }
  const outcome = parseOutcomeSchema.safeParse(value);
  if (!outcome.success) return { status: "failed", reason: "error" };
  return outcome.data.outcome === "parsed"
    ? { status: "done", result: outcome.data.result }
    : { status: "failed", reason: REJECTION_REASONS[outcome.data.reason] };
};

/** The worker in use, and what the hook knows about it. */
type WorkerSlot = {
  worker: Worker;
  ready: boolean;
  startupTimer: ReturnType<typeof setTimeout> | undefined;
  /** Removes the slot's listeners. */
  detach: () => void;
};

/** The latest file, from when its bytes are read until its parse ends. */
type Request = {
  id: number;
  /** Read, and waiting for the worker to be ready; given away once sent. */
  pdf: ArrayBuffer | null;
  /** The worker it was sent to. */
  sentTo: Worker | null;
  parseTimer: ReturnType<typeof setTimeout> | undefined;
};

/**
 * Parses a PDF in the browser, in the parser's worker. The worker is created when the hook mounts, so Python is
 * loading before a file is chosen. After a timeout or a failure it's replaced, so the next file gets a fresh one: at
 * once if it had loaded or a file was waiting, otherwise on the next `start` (see `failLoading`). Only the latest file counts: a new `start` or a `reset` drops the parse in flight.
 */
export const useAtsParse = (
  options: { createWorker?: () => Worker } = {},
): {
  parse: AtsParse | null;
  /** Starts over with a new file. */
  start: (file: File) => void;
  /** Forgets the current file's parse. */
  reset: () => void;
} => {
  const [parse, setParse] = useState<AtsParse | null>(null);
  const createWorker = options.createWorker ?? createParserWorker;
  // Read when a worker is created, so a `createWorker` that changes between renders doesn't recreate it.
  const createWorkerRef = useRef(createWorker);
  createWorkerRef.current = createWorker;

  const slot = useRef<WorkerSlot | null>(null);
  const request = useRef<Request | null>(null);
  // Counts starts and resets, so a file still being read is dropped if the page moved on. Also the parse's id.
  const generation = useRef(0);

  const clearRequest = () => {
    clearTimeout(request.current?.parseTimer);
    request.current = null;
  };

  /** Ends the current file's parse. */
  const finish = (next: AtsParse) => {
    clearRequest();
    setParse(next);
  };

  const dropWorker = () => {
    const current = slot.current;
    if (!current) return;
    clearTimeout(current.startupTimer);
    current.detach();
    current.worker.terminate();
    slot.current = null;
  };

  /** Sends the waiting file, if there is one and the worker is ready. */
  const sendWaiting = () => {
    const current = slot.current;
    const waiting = request.current;
    if (!waiting?.pdf) return;
    // No worker could be created (a browser without workers), so nothing can parse it.
    if (!current) {
      finish({ status: "failed", reason: "error" });
      return;
    }
    if (!current.ready) return;
    const pdf = waiting.pdf;
    waiting.pdf = null;
    waiting.sentTo = current.worker;
    const message: ParseRequest = { type: "parse", id: waiting.id, pdf };
    // Transferred: the page keeps no copy, and the bytes go nowhere else.
    current.worker.postMessage(message, [pdf]);
    waiting.parseTimer = setTimeout(() => {
      if (request.current !== waiting) return;
      finish({ status: "failed", reason: "timed-out" });
      replaceWorker();
    }, PARSE_TIMEOUT_MS);
    setParse({ status: "processing" });
  };

  /** Fails the current file if it's waiting for, or sent to, the worker that just failed. */
  const failWaiting = (worker: Worker, reason: AtsFailureReason) => {
    const waiting = request.current;
    if (waiting && (waiting.pdf !== null || waiting.sentTo === worker)) finish({ status: "failed", reason });
  };

  const startWorker = () => {
    let worker: Worker;
    try {
      worker = createWorkerRef.current();
    } catch {
      slot.current = null;
      return;
    }
    const onMessage = (event: MessageEvent<FromWorker>) => {
      const data = event.data;
      if (slot.current?.worker !== worker) return;
      switch (data.type) {
        case "ready":
          clearTimeout(next.startupTimer);
          next.ready = true;
          sendWaiting();
          return;
        case "load-failed":
          failLoading(worker, "error");
          return;
        case "outcome":
          if (request.current?.id === data.id) finish(toParse(data.json));
          return;
        case "parse-failed":
          // After a Python exception the interpreter's state can't be trusted, whichever file raised it.
          if (request.current?.id === data.id) finish({ status: "failed", reason: "error" });
          else failWaiting(worker, "error");
          replaceWorker();
          return;
      }
    };
    const onError = (event: Event) => {
      // Never read the event's message: it can carry text from the worker, which can quote the CV.
      event.preventDefault();
      if (slot.current?.worker !== worker) return;
      if (!next.ready) {
        failLoading(worker, "error");
        return;
      }
      failWaiting(worker, "error");
      replaceWorker();
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    const next: WorkerSlot = {
      worker,
      ready: false,
      startupTimer: setTimeout(() => {
        if (slot.current?.worker !== worker) return;
        failLoading(worker, "timed-out");
      }, STARTUP_TIMEOUT_MS),
      detach: () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      },
    };
    slot.current = next;
  };

  const replaceWorker = () => {
    dropWorker();
    startWorker();
  };

  /**
   * The worker failed before it was ready. A new one is created at once only if a file was waiting for it; otherwise
   * the next `start` creates it, so a load that keeps failing (a missing file after a deploy, offline, out of memory)
   * never loops.
   */
  const failLoading = (worker: Worker, reason: AtsFailureReason) => {
    const fileWaiting = request.current?.pdf != null;
    failWaiting(worker, reason);
    if (fileWaiting) replaceWorker();
    else dropWorker();
  };

  // Created after mounting, never while rendering: prerendering runs in Node, which has no `Worker`.
  useEffect(() => {
    startWorker();
    return () => {
      dropWorker();
      clearRequest();
    };
    // Once per mount; the helpers only read refs.
  }, []);

  const start = (file: File) => {
    const mine = ++generation.current;
    clearRequest();
    // None after a failed load (or none could be created): this file gets a new one.
    if (!slot.current) startWorker();
    setParse({ status: slot.current?.ready ? "processing" : "loading" });
    if (file.size > MAX_FILE_BYTES) {
      setParse({ status: "failed", reason: "too-large" });
      return;
    }
    // Nothing is sent for a file that isn't a PDF, or that can't be read. The file's name is never used.
    const read = async (): Promise<ArrayBuffer | null> => ((await looksLikePdf(file)) ? file.arrayBuffer() : null);
    read().then(
      (pdf) => {
        if (generation.current !== mine) return;
        if (!pdf) {
          setParse({ status: "failed", reason: "not-pdf" });
          return;
        }
        request.current = { id: mine, pdf, sentTo: null, parseTimer: undefined };
        // The worker may have failed to load while the file was read, leaving none.
        if (!slot.current) startWorker();
        sendWaiting();
      },
      () => {
        if (generation.current === mine) setParse({ status: "failed", reason: "error" });
      },
    );
  };

  const reset = () => {
    generation.current++;
    clearRequest();
    setParse(null);
  };

  return { parse, start, reset };
};
