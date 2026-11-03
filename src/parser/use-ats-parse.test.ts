// Checks for the hook (Group C3), written from the interface before the hook: platform-docs/ats/browser/interface-c.md.
// A fake Worker stands in for the parser's, so these run in jsdom with fake timers; the real worker is checked
// through the built page (platform-docs/ats/browser/checks/c/c_page.mjs). Timings come from the hook's constants.
import { fc } from "@fast-check/vitest";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The hook and the generated zod are loaded by path, with the interface's types written out here: these checks
// exist before the code, and a static import of a missing module would fail `tsc --noEmit`, and with it
// `pnpm build`, for the whole run.
type AtsParse =
  | { status: "loading" }
  | { status: "processing" }
  | { status: "done"; result: unknown }
  | { status: "failed"; reason: string };
type HookModule = {
  useAtsParse: (options?: { createWorker?: () => Worker }) => {
    parse: AtsParse | null;
    start: (file: File) => void;
    reset: () => void;
  };
  STARTUP_TIMEOUT_MS: number;
  PARSE_TIMEOUT_MS: number;
};
type SchemaModule = { parseOutcomeSchema: { safeParse: (value: unknown) => { success: boolean } } };

const load = async <T>(specifier: string): Promise<T> => {
  try {
    return (await import(/* @vite-ignore */ specifier)) as T;
  } catch (error) {
    throw new Error(`Couldn't load ${specifier} (src/parser/): ${(error as Error).message}`, { cause: error });
  }
};

let useAtsParse: HookModule["useAtsParse"];
let STARTUP_TIMEOUT_MS: number;
let PARSE_TIMEOUT_MS: number;
let parseOutcomeSchema: SchemaModule["parseOutcomeSchema"];

beforeAll(async () => {
  ({ useAtsParse, STARTUP_TIMEOUT_MS, PARSE_TIMEOUT_MS } = await load<HookModule>("./use-ats-parse"));
  ({ parseOutcomeSchema } = await load<SchemaModule>("./generated/parse-outcome"));
  for (const [name, value] of Object.entries({ STARTUP_TIMEOUT_MS, PARSE_TIMEOUT_MS }))
    if (typeof value !== "number" || !(value > 0)) throw new Error(`use-ats-parse doesn't export ${name} as a positive number`);
});

type ParseMessage = { type: "parse"; id: number; pdf: ArrayBuffer };

/** Every `parse` message any fake worker received, in order. */
let sent: { worker: FakeWorker; message: ParseMessage }[] = [];
let workers: FakeWorker[] = [];

const isParse = (message: unknown): message is ParseMessage =>
  typeof message === "object" && message !== null && (message as { type?: unknown }).type === "parse";

/** A Worker the test drives: it records what the page sends, and replies only when told to. */
class FakeWorker extends EventTarget {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  posted: { message: unknown; transfer: unknown }[] = [];
  terminated = false;
  ready = false;

  postMessage(message: unknown, transfer?: unknown) {
    this.posted.push({ message, transfer });
    if (isParse(message)) sent.push({ worker: this, message });
  }

  terminate() {
    this.terminated = true;
  }

  /**
   * A message from the worker. A terminated worker sends none, unless `queued`: a reply it posted just before it was
   * terminated, already on its way to the page (the hook must still ignore it if it's stale).
   */
  emit(data: unknown, queued = false) {
    if (this.terminated && !queued) return;
    if (isParse(data)) throw new Error("emit replies, not parse requests");
    if ((data as { type?: string }).type === "ready") this.ready = true;
    const event = new MessageEvent("message", { data });
    this.dispatchEvent(event);
    this.onmessage?.(event);
  }

  /** The worker crashed (an uncaught error in it). */
  crash() {
    if (this.terminated) return;
    const event = typeof ErrorEvent === "function" ? new ErrorEvent("error") : new Event("error");
    this.dispatchEvent(event);
    this.onerror?.(event);
  }
}

const createWorker = () => {
  const worker = new FakeWorker();
  workers.push(worker);
  return worker as unknown as Worker;
};

const newest = () => workers[workers.length - 1];

/** An invented PDF-looking file; its marker is in its bytes, so a parse request says which file it carries. */
const pdf = (marker: number) =>
  new File([`%PDF-1.7\n% invented test file, marker ${marker}\n`], "invented.pdf", { type: "application/pdf" });

const markerOf = (message: ParseMessage) => {
  const match = /marker (\d+)/.exec(new TextDecoder().decode(new Uint8Array(message.pdf)));
  if (!match) throw new Error("a parse request without the file's bytes");
  return Number(match[1]);
};

/** A parsed outcome whose `character_count` carries a marker, so the result shown says which reply it came from. */
const parsedOutcome = (marker: number) => ({
  outcome: "parsed",
  result: {
    visibility: "readable",
    page_count: 1,
    character_count: marker,
    text: "Invented Person\ninvented@example.com",
    contact: { name: "Invented Person", email: "invented@example.com", phone: null, location: null, links: [] },
    sections: [],
    experience: [],
    experience_months: null,
    education: [],
    skills: [],
    warnings: [],
  },
});

const REJECTIONS = [
  ["too_many_pages", "too-many-pages"],
  ["encrypted", "encrypted"],
  ["corrupt", "corrupt"],
  ["timed_out", "timed-out"],
] as const;
type RejectReason = (typeof REJECTIONS)[number][0];

const rejectedOutcome = (reason: RejectReason) => ({ outcome: "rejected", reason });

const outcomeMessage = (message: ParseMessage, outcome: unknown) => ({
  type: "outcome",
  id: message.id,
  json: typeof outcome === "string" ? outcome : JSON.stringify(outcome),
});

/** Lets promises (reading the file, the hook's effects) settle without moving the clock. */
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(0);
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await flush();
};

const send = async (worker: FakeWorker, data: unknown) => {
  act(() => worker.emit(data));
  await flush();
};

/** A reply that was already on its way when its worker was terminated (or is still alive). */
const sendLate = async (worker: FakeWorker, data: unknown) => {
  act(() => worker.emit(data, true));
  await flush();
};

/** The latest parse request: the one for the file chosen last. */
const lastSent = () => {
  const last = sent[sent.length - 1];
  if (!last) throw new Error("no parse request was sent to any worker");
  return last;
};

const mount = () => renderHook(() => useAtsParse({ createWorker }));

const choose = async (hook: ReturnType<typeof mount>, file: File) => {
  act(() => hook.result.current.start(file));
  await flush();
};

/** Gets the chosen file's parse request out: makes every live worker ready, and returns the newest request. */
const readyAndSent = async () => {
  for (const worker of workers) if (!worker.ready && !worker.terminated) await send(worker, { type: "ready" });
  return lastSent();
};

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  workers = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the test's own fixtures", () => {
  it("are valid outcomes, so a failure below is the hook's", () => {
    expect(parseOutcomeSchema.safeParse(parsedOutcome(1)).success).toBe(true);
    for (const [reason] of REJECTIONS) expect(parseOutcomeSchema.safeParse(rejectedOutcome(reason)).success).toBe(true);
  });
});

describe("useAtsParse: loading and processing", () => {
  it("creates the worker on mount, and a file chosen before ready shows loading, then processing once ready", async () => {
    const hook = mount();
    await flush();
    expect(workers).toHaveLength(1);
    expect(hook.result.current.parse).toBeNull();

    await choose(hook, pdf(1));
    expect(hook.result.current.parse).toEqual({ status: "loading" });

    await send(workers[0], { type: "ready" });
    expect(hook.result.current.parse).toEqual({ status: "processing" });

    const { worker, message } = lastSent();
    expect(markerOf(message)).toBe(1);
    await send(worker, outcomeMessage(message, parsedOutcome(1)));
    expect(hook.result.current.parse).toMatchObject({ status: "done", result: { character_count: 1 } });
  });

  it("maps a parsed outcome to done", async () => {
    const hook = mount();
    await send(workers[0], { type: "ready" });
    await choose(hook, pdf(7));
    expect(hook.result.current.parse).toEqual({ status: "processing" });
    const { worker, message } = lastSent();
    await send(worker, outcomeMessage(message, parsedOutcome(7)));
    expect(hook.result.current.parse).toMatchObject({ status: "done", result: { character_count: 7 } });
  });

  it.each(REJECTIONS)("maps rejected %s to failed %s", async (reason, state) => {
    const hook = mount();
    await choose(hook, pdf(1));
    const { worker, message } = await readyAndSent();
    await send(worker, outcomeMessage(message, rejectedOutcome(reason)));
    expect(hook.result.current.parse).toEqual({ status: "failed", reason: state });
  });
});

describe("useAtsParse: start-up failures with a file waiting", () => {
  it("times out a start-up that passes STARTUP_TIMEOUT_MS, terminates the worker, and sends the next file to a new one", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    expect(hook.result.current.parse).toEqual({ status: "loading" });

    await advance(STARTUP_TIMEOUT_MS - 1);
    expect(hook.result.current.parse).toEqual({ status: "loading" });
    expect(workers[0].terminated).toBe(false);

    await advance(2);
    expect(hook.result.current.parse).toEqual({ status: "failed", reason: "timed-out" });
    expect(workers[0].terminated).toBe(true);
    // A new worker at once, in the background, before any new file.
    expect(workers).toHaveLength(2);

    await choose(hook, pdf(2));
    const { worker, message } = await readyAndSent();
    expect(worker).toBe(workers[1]);
    expect(markerOf(message)).toBe(2);
    expect(workers[0].posted.filter((p) => isParse(p.message) && markerOf(p.message) === 2)).toHaveLength(0);
    await send(worker, outcomeMessage(message, parsedOutcome(2)));
    expect(hook.result.current.parse).toMatchObject({ status: "done", result: { character_count: 2 } });
  });

  it("counts the start-up from the worker's creation, not from the file's choice", async () => {
    const hook = mount();
    await advance(STARTUP_TIMEOUT_MS - 1);
    await choose(hook, pdf(1));
    expect(hook.result.current.parse).toEqual({ status: "loading" });
    await advance(2);
    expect(hook.result.current.parse).toEqual({ status: "failed", reason: "timed-out" });
    expect(workers[0].terminated).toBe(true);
  });

  it("ends in error on an error event before ready with a file waiting, and creates a new worker at once", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    expect(hook.result.current.parse).toEqual({ status: "loading" });
    act(() => workers[0].crash());
    await flush();
    expect(hook.result.current.parse).toEqual({ status: "failed", reason: "error" });
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
  });
});

// A failure while loading, with no file waiting, terminates the worker but doesn't create another: the next `start`
// does, so a load that keeps failing never loops.
describe("useAtsParse: a load failure with no file waiting", () => {
  const failures: [string, () => Promise<void>][] = [
    ["the start-up timeout", () => advance(STARTUP_TIMEOUT_MS + 1)],
    ["load-failed", () => send(workers[0], { type: "load-failed" })],
    [
      "an error event before ready",
      async () => {
        act(() => workers[0].crash());
        await flush();
      },
    ],
  ];

  it.each(failures)("%s terminates the worker, creates none until start, and start uses a new one", async (_label, failure) => {
    const hook = mount();
    await flush();
    expect(workers).toHaveLength(1);
    await failure();
    expect(workers[0].terminated).toBe(true);
    expect(hook.result.current.parse).toBeNull();

    // No new worker while nothing is waiting, however long the page stays open.
    await advance(2 * STARTUP_TIMEOUT_MS + 1);
    expect(workers).toHaveLength(1);
    expect(hook.result.current.parse).toBeNull();

    await choose(hook, pdf(2));
    expect(workers).toHaveLength(2);
    expect(hook.result.current.parse).toEqual({ status: "loading" });
    const { worker, message } = await readyAndSent();
    expect(worker).toBe(workers[1]);
    expect(markerOf(message)).toBe(2);
    await send(worker, outcomeMessage(message, parsedOutcome(2)));
    expect(hook.result.current.parse).toMatchObject({ status: "done", result: { character_count: 2 } });
  });
});

describe("useAtsParse: timeouts after ready", () => {
  it("times out a parse that passes PARSE_TIMEOUT_MS from sending it, terminates the worker, and uses a new one next", async () => {
    const hook = mount();
    await send(workers[0], { type: "ready" });
    // Ready stops the start-up clock, and the parse clock only starts when a parse is sent.
    await advance(Math.max(STARTUP_TIMEOUT_MS, PARSE_TIMEOUT_MS) + 1);
    expect(workers[0].terminated).toBe(false);
    expect(workers).toHaveLength(1);

    await choose(hook, pdf(1));
    expect(hook.result.current.parse).toEqual({ status: "processing" });
    expect(lastSent().worker).toBe(workers[0]);

    await advance(PARSE_TIMEOUT_MS - 1);
    expect(hook.result.current.parse).toEqual({ status: "processing" });
    await advance(2);
    expect(hook.result.current.parse).toEqual({ status: "failed", reason: "timed-out" });
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);

    await choose(hook, pdf(2));
    const { worker, message } = await readyAndSent();
    expect(worker).toBe(workers[1]);
    expect(markerOf(message)).toBe(2);
    await send(worker, outcomeMessage(message, parsedOutcome(2)));
    expect(hook.result.current.parse).toMatchObject({ status: "done", result: { character_count: 2 } });
  });
});

describe("useAtsParse: only the latest file counts", () => {
  it("shows the newer file's result, and the older reply arriving later changes nothing", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    const older = await readyAndSent();
    await choose(hook, pdf(2));
    const newer = await readyAndSent();
    expect(markerOf(older.message)).toBe(1);
    expect(markerOf(newer.message)).toBe(2);

    await send(newer.worker, outcomeMessage(newer.message, parsedOutcome(2)));
    expect(hook.result.current.parse).toMatchObject({ status: "done", result: { character_count: 2 } });
    await sendLate(older.worker, outcomeMessage(older.message, rejectedOutcome("encrypted")));
    expect(hook.result.current.parse).toMatchObject({ status: "done", result: { character_count: 2 } });
  });

  it("ignores the older file's reply arriving first", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    const older = await readyAndSent();
    await choose(hook, pdf(2));
    const newer = await readyAndSent();

    await sendLate(older.worker, outcomeMessage(older.message, parsedOutcome(1)));
    expect(hook.result.current.parse).toEqual({ status: "processing" });
    await send(newer.worker, outcomeMessage(newer.message, parsedOutcome(2)));
    expect(hook.result.current.parse).toMatchObject({ status: "done", result: { character_count: 2 } });
  });

  it("ignores a reply that arrives after a reset", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    const { worker, message } = await readyAndSent();
    act(() => hook.result.current.reset());
    await flush();
    expect(hook.result.current.parse).toBeNull();
    await sendLate(worker, outcomeMessage(message, parsedOutcome(1)));
    expect(hook.result.current.parse).toBeNull();
  });

  it("shows only the latest file's outcome, whatever the order of starts, resets, readies and replies", async () => {
    type Command =
      | { kind: "start" }
      | { kind: "reset" }
      | { kind: "ready" }
      | { kind: "reply"; pick: number; outcome: "parsed" | RejectReason };
    const command = fc.oneof(
      fc.constant<Command>({ kind: "start" }),
      fc.constant<Command>({ kind: "reset" }),
      fc.constant<Command>({ kind: "ready" }),
      fc.record({
        kind: fc.constant("reply" as const),
        pick: fc.nat(),
        outcome: fc.constantFrom("parsed" as const, ...REJECTIONS.map(([reason]) => reason)),
      }),
    );

    await fc.assert(
      fc.asyncProperty(fc.array(command, { maxLength: 14 }), async (commands) => {
        sent = [];
        workers = [];
        const hook = mount();
        await flush();
        let marker = 0;
        // The file the page shows, and the index in `sent` from which requests are its own.
        let current: { marker: number; from: number } | null = null;
        let answer: unknown = undefined;
        const replied = new Set<ParseMessage>();
        try {
          for (const step of commands) {
            if (step.kind === "start") {
              marker++;
              current = { marker, from: sent.length };
              answer = undefined;
              await choose(hook, pdf(marker));
            } else if (step.kind === "reset") {
              current = null;
              answer = undefined;
              act(() => hook.result.current.reset());
              await flush();
            } else if (step.kind === "ready") {
              const worker = newest();
              if (!worker.ready && !worker.terminated) await send(worker, { type: "ready" });
            } else {
              const pool = sent.filter((s) => !replied.has(s.message) && !s.worker.terminated);
              if (pool.length === 0) continue;
              const target = pool[step.pick % pool.length];
              replied.add(target.message);
              const fileMarker = markerOf(target.message);
              const outcome =
                step.outcome === "parsed" ? parsedOutcome(fileMarker) : rejectedOutcome(step.outcome);
              const index = sent.indexOf(target);
              if (current && index >= current.from && answer === undefined)
                answer =
                  step.outcome === "parsed"
                    ? { status: "done", result: { character_count: current.marker } }
                    : { status: "failed", reason: REJECTIONS.find(([r]) => r === step.outcome)![1] };
              await send(target.worker, outcomeMessage(target.message, outcome));
            }

            const parse = hook.result.current.parse;
            if (current === null) expect(parse).toBeNull();
            else if (answer !== undefined) expect(parse).toMatchObject(answer as object);
            else expect(parse).toEqual({ status: newest().ready ? "processing" : "loading" });
          }
        } finally {
          hook.unmount();
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe("useAtsParse: errors", () => {
  it.each([
    ["JSON that isn't an outcome", { outcome: "parsed" }],
    ["an unknown rejection reason", { outcome: "rejected", reason: "not_a_reason" }],
    ["a result missing fields", { outcome: "parsed", result: { visibility: "readable" } }],
    ["text that isn't JSON", "{ not json"],
  ])("ends in error for an outcome that fails the schema: %s", async (_label, outcome) => {
    const hook = mount();
    await choose(hook, pdf(1));
    const { worker, message } = await readyAndSent();
    await send(worker, outcomeMessage(message, outcome));
    expect(hook.result.current.parse).toEqual({ status: "failed", reason: "error" });
  });

  it("ends in error when the parse fails in Python, terminates the worker and sends the next file to a new one", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    const { worker, message } = await readyAndSent();
    expect(worker).toBe(workers[0]);
    await send(worker, { type: "parse-failed", id: message.id });
    expect(hook.result.current.parse).toEqual({ status: "failed", reason: "error" });
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);

    await choose(hook, pdf(2));
    const next = await readyAndSent();
    expect(next.worker).toBe(workers[1]);
    expect(markerOf(next.message)).toBe(2);
  });

  it("ends in error when Pyodide fails to load, terminates the worker and sends the next file to a new one", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    expect(hook.result.current.parse).toEqual({ status: "loading" });
    await send(workers[0], { type: "load-failed" });
    expect(hook.result.current.parse).toEqual({ status: "failed", reason: "error" });
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);

    await choose(hook, pdf(2));
    const { worker, message } = await readyAndSent();
    expect(worker).toBe(workers[1]);
    expect(markerOf(message)).toBe(2);
  });

  it("ends in error on a worker error event, terminates the worker and sends the next file to a new one", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    await readyAndSent();
    expect(hook.result.current.parse).toEqual({ status: "processing" });
    act(() => workers[0].crash());
    await flush();
    expect(hook.result.current.parse).toEqual({ status: "failed", reason: "error" });
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);

    await choose(hook, pdf(2));
    const { worker, message } = await readyAndSent();
    expect(worker).toBe(workers[1]);
    expect(markerOf(message)).toBe(2);
    await send(worker, outcomeMessage(message, parsedOutcome(2)));
    expect(hook.result.current.parse).toMatchObject({ status: "done", result: { character_count: 2 } });
  });
});

describe("useAtsParse: what goes to the worker", () => {
  it("posts the PDF's bytes with the ArrayBuffer in the transfer list, and never the file's name", async () => {
    const name = "invented-name-q7x3k.pdf";
    const bytes = new TextEncoder().encode("%PDF-1.7\n% invented test file, marker 5\n");
    const hook = mount();
    act(() => hook.result.current.start(new File([bytes], name, { type: "application/pdf" })));
    await flush();
    const { worker, message } = await readyAndSent();

    expect(message.pdf).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(message.pdf)), "the posted bytes aren't the file's").toEqual(Array.from(bytes));
    const posted = worker.posted.find((p) => p.message === message)!;
    const transfer = Array.isArray(posted.transfer)
      ? posted.transfer
      : ((posted.transfer as { transfer?: unknown[] } | undefined)?.transfer ?? []);
    expect(transfer, "the pdf ArrayBuffer isn't in the transfer list").toContain(message.pdf);

    // Nothing posted to any worker carries the name: no string holding it, and no File or Blob (which carries it).
    const leaks: string[] = [];
    const visit = (value: unknown, where: string) => {
      if (typeof value === "string" && value.includes(name.replace(/\.pdf$/, ""))) leaks.push(where);
      else if (value instanceof Blob) leaks.push(`${where} (a ${value.constructor.name})`);
      else if (value instanceof ArrayBuffer) {
        if (new TextDecoder().decode(new Uint8Array(value)).includes(name.replace(/\.pdf$/, ""))) leaks.push(where);
      } else if (value && typeof value === "object")
        for (const [key, inner] of Object.entries(value)) visit(inner, `${where}.${key}`);
    };
    workers.forEach((w, i) => w.posted.forEach((p, j) => visit(p.message, `worker ${i}, message ${j}`)));
    expect(leaks, "the file's name went to the worker").toEqual([]);
  });
});

// Bugs found in review (each gets a test).
describe("useAtsParse: a dropped parse replaces its worker", () => {
  it("terminates the worker when a new file drops an unanswered parse, and sends the new file to a new worker", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    const older = await readyAndSent();
    expect(older.worker).toBe(workers[0]);

    await choose(hook, pdf(2));
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    const newer = await readyAndSent();
    expect(newer.worker).toBe(workers[1]);
    expect(markerOf(newer.message)).toBe(2);
    await send(newer.worker, outcomeMessage(newer.message, parsedOutcome(2)));
    expect(hook.result.current.parse).toMatchObject({ status: "done", result: { character_count: 2 } });
  });

  it("terminates the worker when a reset drops an unanswered parse, and sends the next file to a new worker", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    await readyAndSent();
    act(() => hook.result.current.reset());
    await flush();
    expect(hook.result.current.parse).toBeNull();
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);

    await choose(hook, pdf(2));
    const { worker, message } = await readyAndSent();
    expect(worker).toBe(workers[1]);
    expect(markerOf(message)).toBe(2);
  });

  it("keeps the worker when the parse was already answered", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    const first = await readyAndSent();
    await send(first.worker, outcomeMessage(first.message, parsedOutcome(1)));

    await choose(hook, pdf(2));
    expect(workers[0].terminated).toBe(false);
    expect(workers).toHaveLength(1);
    expect(hook.result.current.parse).toEqual({ status: "processing" });
    expect(lastSent().worker).toBe(workers[0]);
    expect(markerOf(lastSent().message)).toBe(2);
  });
});

describe("useAtsParse: a corrupt rejection replaces the worker", () => {
  it("ends failed/corrupt, terminates the worker, and sends the next file to a new one", async () => {
    const hook = mount();
    await choose(hook, pdf(1));
    const { worker, message } = await readyAndSent();
    await send(worker, outcomeMessage(message, rejectedOutcome("corrupt")));
    expect(hook.result.current.parse).toEqual({ status: "failed", reason: "corrupt" });
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);

    await choose(hook, pdf(2));
    const next = await readyAndSent();
    expect(next.worker).toBe(workers[1]);
    expect(markerOf(next.message)).toBe(2);
  });

  it.each(REJECTIONS.filter(([reason]) => reason !== "corrupt"))(
    "keeps the worker after rejected %s",
    async (reason, state) => {
      const hook = mount();
      await choose(hook, pdf(1));
      const { worker, message } = await readyAndSent();
      await send(worker, outcomeMessage(message, rejectedOutcome(reason)));
      expect(hook.result.current.parse).toEqual({ status: "failed", reason: state });
      expect(workers[0].terminated).toBe(false);
      expect(workers).toHaveLength(1);

      await choose(hook, pdf(2));
      expect(lastSent().worker).toBe(workers[0]);
      expect(markerOf(lastSent().message)).toBe(2);
    },
  );
});
