import { fc, test } from "@fast-check/vitest";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_PENDING_MS,
  MAX_UPLOAD_BYTES,
  POLL_INTERVAL_MS,
  UPLOAD_TIMEOUT_MS,
  rejectionReason,
  requestFailureReason,
  toParse,
  useAtsParse,
  type AtsFailureReason,
} from "./ats";
import { ApiError, customFetch } from "./fetcher";
import type { ParseResultOutput, ParseStatusResponseOutput } from "./generated/model";
import { invisibleResult, partialResult, readableResult } from "@/components/ats/fixtures";

// ---------------------------------------------------------------------------------------------
// Pure mapping
// ---------------------------------------------------------------------------------------------

const FAILURE_KINDS: AtsFailureReason[] = [
  "rate-limited",
  "too-large",
  "not-pdf",
  "too-many-pages",
  "encrypted",
  "corrupt",
  "timed-out",
  "error",
];

describe("requestFailureReason", () => {
  it("maps the statuses the api and the proxy use to their own kinds", () => {
    expect(requestFailureReason(new ApiError(429, "Too Many Requests"))).toBe("rate-limited");
    expect(requestFailureReason(new ApiError(413, { detail: "too big" }))).toBe("too-large");
    expect(requestFailureReason(new ApiError(415, { detail: "not a pdf" }))).toBe("not-pdf");
  });

  test.prop([fc.integer({ min: 100, max: 599 }).filter((s) => ![429, 413, 415].includes(s)), fc.anything()])(
    "any other status is a plain error",
    (status, body) => {
      expect(requestFailureReason(new ApiError(status, body))).toBe("error");
    },
  );

  it("treats a timeout or an abort as timed out", () => {
    expect(requestFailureReason(new DOMException("signal timed out", "TimeoutError"))).toBe("timed-out");
    expect(requestFailureReason(new DOMException("aborted", "AbortError"))).toBe("timed-out");
  });

  it("treats anything else that was thrown as an error", () => {
    expect(requestFailureReason(new TypeError("Failed to fetch"))).toBe("error");
    expect(requestFailureReason(new Error("boom"))).toBe("error");
    expect(requestFailureReason(new DOMException("nope", "NotAllowedError"))).toBe("error");
    expect(requestFailureReason("a string")).toBe("error");
    expect(requestFailureReason(undefined)).toBe("error");
  });

  it("recognises a plain-text 429 as it comes through customFetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("Too Many Requests", { status: 429, headers: { "content-type": "text/plain" } }),
        ),
      ),
    );
    try {
      const error = await customFetch("/api/ats/upload", {}).catch((e: unknown) => e);
      expect(requestFailureReason(error)).toBe("rate-limited");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("rejectionReason", () => {
  it("gives each documented reason its own kind", () => {
    expect(rejectionReason("too_many_pages")).toBe("too-many-pages");
    expect(rejectionReason("encrypted")).toBe("encrypted");
    expect(rejectionReason("corrupt")).toBe("corrupt");
    expect(rejectionReason("timed_out")).toBe("timed-out");
    expect(rejectionReason("error")).toBe("error");
  });

  it("counts a null or absent reason as an unknown error", () => {
    expect(rejectionReason(null)).toBe("error");
    expect(rejectionReason(undefined)).toBe("error");
  });

  it("gives distinct kinds to distinct documented reasons", () => {
    const reasons = ["too_many_pages", "encrypted", "corrupt", "timed_out", "error"] as const;
    expect(new Set(reasons.map(rejectionReason)).size).toBe(reasons.length);
  });
});

describe("toParse", () => {
  const results: ParseResultOutput[] = [readableResult, partialResult, invisibleResult];
  const statusArb: fc.Arbitrary<ParseStatusResponseOutput | undefined> = fc.option(
    fc.record(
      {
        state: fc.constantFrom("pending", "done", "failed"),
        result: fc.option(fc.constantFrom(...results), { nil: undefined }),
        reason: fc.option(fc.constantFrom("too_many_pages", "encrypted", "corrupt", "timed_out", "error"), {
          nil: undefined,
        }),
      },
      { requiredKeys: ["state"] },
    ) as fc.Arbitrary<ParseStatusResponseOutput>,
    { nil: undefined },
  );
  const errorArb = fc.option(
    fc.oneof(
      fc.integer({ min: 400, max: 599 }).map((s) => new ApiError(s, undefined)),
      fc.constant(new Error("x")),
      fc.constant(new DOMException("t", "TimeoutError")),
    ),
    { nil: null },
  );
  const inputsArb = fc.record({
    clientFailure: fc.option(fc.constantFrom(...FAILURE_KINDS), { nil: null }),
    uploadError: errorArb,
    uploadedTaskId: fc.option(fc.string(), { nil: undefined }),
    statusError: errorArb,
    status: statusArb,
    timedOut: fc.boolean(),
  });

  test.prop([inputsArb])("always gives a valid state", (inputs) => {
    const parse = toParse(inputs);
    expect(["uploading", "processing", "done", "failed"]).toContain(parse.status);
    if (parse.status === "failed") expect(FAILURE_KINDS).toContain(parse.reason);
    if (parse.status === "done") expect(parse.result).toBeTruthy();
  });

  const clean = {
    clientFailure: null,
    uploadError: null,
    statusError: null,
    uploadedTaskId: "t",
  } as const;

  test.prop([fc.constantFrom(...results), fc.boolean()])(
    "a done response with a result is done, timed out or not",
    (result, timedOut) => {
      expect(toParse({ ...clean, status: { state: "done", result }, timedOut })).toEqual({
        status: "done",
        result,
      });
    },
  );

  test.prop([fc.constantFrom(null, undefined), fc.boolean()])(
    "a done response with no result is a failure",
    (result, timedOut) => {
      const parse = toParse({ ...clean, status: { state: "done", result }, timedOut });
      expect(parse.status).toBe("failed");
    },
  );

  test.prop([fc.option(fc.constantFrom("too_many_pages", "encrypted", "corrupt", "timed_out", "error"), { nil: undefined }), fc.boolean()])(
    "a failed response is a failure whose kind comes from its reason, timed out or not",
    (reason, timedOut) => {
      expect(toParse({ ...clean, status: { state: "failed", reason }, timedOut })).toEqual({
        status: "failed",
        reason: rejectionReason(reason),
      });
    },
  );

  it("is uploading until a task id arrives, and processing while the task is pending", () => {
    const base = { ...clean, uploadedTaskId: undefined, status: undefined, timedOut: false };
    expect(toParse(base)).toEqual({ status: "uploading" });
    expect(toParse({ ...base, uploadedTaskId: "t" })).toEqual({ status: "processing" });
    expect(toParse({ ...base, uploadedTaskId: "t", status: { state: "pending" } })).toEqual({
      status: "processing",
    });
  });

  it("is timed out when the task is still pending (or unknown) at the timeout", () => {
    const base = { ...clean, status: undefined, timedOut: true };
    expect(toParse(base)).toEqual({ status: "failed", reason: "timed-out" });
    expect(toParse({ ...base, status: { state: "pending" } })).toEqual({ status: "failed", reason: "timed-out" });
  });

  it("shows a client-side failure and request errors", () => {
    const base = { ...clean, status: undefined, timedOut: false };
    expect(toParse({ ...base, clientFailure: "too-large" })).toEqual({ status: "failed", reason: "too-large" });
    expect(toParse({ ...base, uploadError: new ApiError(415, null) })).toEqual({
      status: "failed",
      reason: "not-pdf",
    });
    expect(toParse({ ...base, statusError: new ApiError(429, "x") })).toEqual({
      status: "failed",
      reason: "rate-limited",
    });
  });
});

// ---------------------------------------------------------------------------------------------
// The hook, against a mocked fetch
// ---------------------------------------------------------------------------------------------

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const accepted = (taskId: string) => json({ task_id: taskId }, 202);
const pending = () => json({ state: "pending" });
const done = (result: ParseResultOutput) => json({ state: "done", result });
const tooMany = () => new Response("Too Many Requests", { status: 429, headers: { "content-type": "text/plain" } });

/** A response that settles with the signal, like a real fetch. */
const hang = (init: RequestInit | undefined) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort);
  });

const isUpload = (init: RequestInit | undefined) => init?.method === "POST";

let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
let client: QueryClient;

const mockFetch = (handler: Handler) => {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal("fetch", fetchMock);
};

const pollCalls = () => fetchMock.mock.calls.filter(([, init]) => !isUpload(init));
const uploadCalls = () => fetchMock.mock.calls.filter(([, init]) => isUpload(init));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const setup = () => renderHook(() => useAtsParse(), { wrapper });

/** A PDF as far as the header goes (`%PDF-`), padded to `size` bytes. */
const pdf = (size = 10, name = "cv.pdf") => {
  const bytes = new Uint8Array(Math.max(size, 5));
  bytes.set(new TextEncoder().encode("%PDF-"));
  return new File([bytes], name, { type: "application/pdf" });
};

/** A file whose first bytes can't be read. */
const unreadable = () => {
  const file = pdf();
  file.slice = () => ({ text: () => Promise.reject(new Error("NotReadableError")) }) as unknown as Blob;
  return file;
};

/** A file whose header read waits until `release` is called. */
const gated = (name: string) => {
  const file = pdf(10, name);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const realSlice = file.slice.bind(file);
  file.slice = (...args: Parameters<Blob["slice"]>) => {
    const piece = realSlice(...args);
    return { text: async () => (await gate, piece.text()) } as unknown as Blob;
  };
  return { file, release };
};

/** Lets time pass in small steps, so timers set by what the earlier steps caused also fire. */
const elapse = async (ms: number, step = 100) => {
  for (let left = ms; left > 0; left -= step) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(step, left));
    });
  }
};

const settle = () => elapse(50, 10);

beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient();
  // `AbortSignal.timeout` runs on real timers; this one runs on the fake clock.
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
    return controller.signal;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  client.clear();
});

describe("useAtsParse", () => {
  it("has no parse before a file is started", () => {
    mockFetch(() => pending());
    const { result } = setup();
    expect(result.current.parse).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("goes from uploading to processing to done, uploading a FormData with one `file` field", async () => {
    let finishUpload!: () => void;
    const uploadGate = new Promise<void>((resolve) => (finishUpload = resolve));
    let polls = 0;
    mockFetch(async (_url, init) => {
      if (isUpload(init)) {
        await uploadGate;
        return accepted("task-1");
      }
      return ++polls < 3 ? pending() : done(readableResult);
    });
    const { result } = setup();
    const file = pdf();

    act(() => result.current.start(file));
    await settle();
    expect(result.current.parse).toEqual({ status: "uploading" });

    finishUpload();
    await settle();
    expect(result.current.parse).toEqual({ status: "processing" });

    await elapse(POLL_INTERVAL_MS * 5);
    expect(result.current.parse).toEqual({ status: "done", result: readableResult });

    expect(uploadCalls()).toHaveLength(1);
    const [url, init] = uploadCalls()[0]!;
    expect(url).toContain("/ats/");
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect([...form.keys()]).toEqual(["file"]);
    const sent = form.get("file") as File;
    expect(sent.size).toBe(file.size);
    // The browser must add the multipart boundary itself.
    expect(new Headers(init?.headers).has("content-type")).toBe(false);
    // The poll asks for the task the upload returned.
    expect(pollCalls().every(([u]) => u.includes("task-1"))).toBe(true);
  });

  it("fails an over-limit file as too large without sending anything", async () => {
    mockFetch(() => accepted("never"));
    const { result } = setup();

    act(() => result.current.start(pdf(MAX_UPLOAD_BYTES + 1)));
    await elapse(POLL_INTERVAL_MS * 3);

    expect(result.current.parse).toEqual({ status: "failed", reason: "too-large" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads a file exactly at the limit", async () => {
    mockFetch((_url, init) => (isUpload(init) ? accepted("t") : done(readableResult)));
    const { result } = setup();
    act(() => result.current.start(pdf(MAX_UPLOAD_BYTES)));
    await elapse(POLL_INTERVAL_MS * 2);
    expect(uploadCalls()).toHaveLength(1);
    expect(result.current.parse?.status).toBe("done");
  });

  it("maps upload errors from the api to their failure kinds", async () => {
    const cases: [Response, AtsFailureReason][] = [
      [tooMany(), "rate-limited"],
      [json({ detail: "big" }, 413), "too-large"],
      [json({ detail: "type" }, 415), "not-pdf"],
      [json({ detail: "boom" }, 500), "error"],
    ];
    for (const [response, reason] of cases) {
      mockFetch(() => response.clone());
      const { result, unmount } = setup();
      act(() => result.current.start(pdf()));
      await settle();
      expect(result.current.parse).toEqual({ status: "failed", reason });
      unmount();
    }
  });

  it("maps a worker rejection to its failure kind", async () => {
    mockFetch((_url, init) =>
      isUpload(init) ? accepted("t") : json({ state: "failed", reason: "encrypted" }),
    );
    const { result } = setup();
    act(() => result.current.start(pdf()));
    await elapse(POLL_INTERVAL_MS);
    expect(result.current.parse).toEqual({ status: "failed", reason: "encrypted" });
  });

  describe("polling", () => {
    it("stops after done", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : done(readableResult)));
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(POLL_INTERVAL_MS * 2);
      expect(result.current.parse?.status).toBe("done");

      const before = pollCalls().length;
      await elapse(MAX_PENDING_MS + POLL_INTERVAL_MS * 5);
      expect(pollCalls()).toHaveLength(before);
      expect(result.current.parse?.status).toBe("done");
    });

    it("stops after failed", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : json({ state: "failed", reason: "corrupt" })));
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(POLL_INTERVAL_MS * 2);
      expect(result.current.parse).toEqual({ status: "failed", reason: "corrupt" });

      const before = pollCalls().length;
      await elapse(MAX_PENDING_MS + POLL_INTERVAL_MS * 5);
      expect(pollCalls()).toHaveLength(before);
    });

    it("keeps polling while pending, then times out and stops", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : pending()));
      const { result } = setup();
      act(() => result.current.start(pdf()));

      await elapse(MAX_PENDING_MS / 2);
      expect(result.current.parse).toEqual({ status: "processing" });
      expect(pollCalls().length).toBeGreaterThan(1);

      await elapse(MAX_PENDING_MS / 2 + POLL_INTERVAL_MS * 2);
      expect(result.current.parse).toEqual({ status: "failed", reason: "timed-out" });

      const before = pollCalls().length;
      await elapse(MAX_PENDING_MS);
      expect(pollCalls()).toHaveLength(before);
      expect(result.current.parse).toEqual({ status: "failed", reason: "timed-out" });
    });

    it("keeps polling with the tab hidden, so a finished result is shown", async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      try {
        document.dispatchEvent(new Event("visibilitychange"));
        let polls = 0;
        mockFetch((_url, init) => {
          if (isUpload(init)) return accepted("t");
          return ++polls < 4 ? pending() : done(readableResult);
        });
        const { result } = setup();
        act(() => result.current.start(pdf()));
        await elapse(POLL_INTERVAL_MS * 8);

        expect(polls).toBeGreaterThanOrEqual(4);
        expect(result.current.parse).toEqual({ status: "done", result: readableResult });
      } finally {
        // Removes the own property, so jsdom's getter shows again.
        delete (document as unknown as Record<string, unknown>).visibilityState;
        document.dispatchEvent(new Event("visibilitychange"));
      }
    });

    it("retries a 429 on a poll instead of failing at once", async () => {
      let polls = 0;
      mockFetch((_url, init) => {
        if (isUpload(init)) return accepted("t");
        return ++polls <= 2 ? tooMany() : done(readableResult);
      });
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(1000);
      // After the first 429, it's neither failed nor lost.
      expect(result.current.parse?.status).not.toBe("failed");

      await elapse(MAX_PENDING_MS / 2);
      expect(result.current.parse).toEqual({ status: "done", result: readableResult });
    });

    it("backs off on a poll that is rate limited for good, and ends timed out rather than rate limited", async () => {
      const times: number[] = [];
      mockFetch((_url, init) => {
        if (isUpload(init)) return accepted("t");
        times.push(Date.now());
        return tooMany();
      });
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS * 3);

      expect(result.current.parse).toEqual({ status: "failed", reason: "timed-out" });
      const gaps = times.slice(1).map((t, i) => t - times[i]!);
      expect(gaps.length).toBeGreaterThan(2);
      // Each gap is at least as long as the one before, and they do grow.
      gaps.slice(1).forEach((gap, i) => expect(gap).toBeGreaterThanOrEqual(gaps[i]!));
      expect(gaps.at(-1)!).toBeGreaterThan(gaps[0]!);
      // Fewer polls than at the normal interval over the same time.
      expect(times.length).toBeLessThan(MAX_PENDING_MS / POLL_INTERVAL_MS);
    });

    it("stops asking once timed out, from a 429 streak", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : tooMany()));
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS + POLL_INTERVAL_MS * 2);
      const before = pollCalls().length;
      await elapse(MAX_PENDING_MS * 3);
      expect(pollCalls()).toHaveLength(before);
    });

    it("fails, rather than crashes, when a done response has an invalid shape", async () => {
      mockFetch((_url, init) =>
        isUpload(init) ? accepted("t") : json({ state: "done", result: { visibility: "bogus" } }),
      );
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS / 2);
      expect(result.current.parse).toEqual({ status: "failed", reason: "error" });
    });

    it("fails when a status has a state outside the contract", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : json({ state: "exploded" })));
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS / 2);
      expect(result.current.parse).toEqual({ status: "failed", reason: "error" });
    });

    it("fails when the upload answers with an invalid body", async () => {
      mockFetch(() => json({ nothing: true }, 202));
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await settle();
      expect(result.current.parse).toEqual({ status: "failed", reason: "error" });
    });
  });

  describe("upload timeout", () => {
    it("ends an upload that never resolves as timed out, and gives a second upload a fresh deadline", async () => {
      mockFetch((_url, init) => hang(init));
      const { result } = setup();

      act(() => result.current.start(pdf()));
      await elapse(UPLOAD_TIMEOUT_MS - 1000);
      expect(result.current.parse).toEqual({ status: "uploading" });
      await elapse(2000);
      expect(result.current.parse).toEqual({ status: "failed", reason: "timed-out" });

      // A second file: its own deadline, not the first one's (already spent).
      act(() => result.current.start(pdf()));
      await elapse(UPLOAD_TIMEOUT_MS - 1000);
      expect(result.current.parse).toEqual({ status: "uploading" });
      await elapse(2000);
      expect(result.current.parse).toEqual({ status: "failed", reason: "timed-out" });
      expect(uploadCalls()).toHaveLength(2);
    });

    it("starts the deadline when the upload does, not when the hook last rendered", async () => {
      let uploads = 0;
      mockFetch((_url, init) => {
        if (!isUpload(init)) return done(readableResult);
        // The first upload is quick; the second one never answers.
        return ++uploads === 1 ? accepted("t") : (hang(init) as unknown as Response);
      });
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await settle();
      await elapse(POLL_INTERVAL_MS * 2);
      expect(result.current.parse?.status).toBe("done");

      // A while later (the page is idle: nothing re-renders), another file is chosen.
      await elapse(UPLOAD_TIMEOUT_MS + 5000);
      act(() => result.current.start(pdf()));
      await elapse(1000);
      expect(result.current.parse).toEqual({ status: "uploading" });
      await elapse(UPLOAD_TIMEOUT_MS);
      expect(result.current.parse).toEqual({ status: "failed", reason: "timed-out" });
    });

    it("hands every upload a signal made when the upload starts", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : pending()));
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await settle();
      act(() => result.current.start(pdf()));
      await settle();
      const [first, second] = uploadCalls().map(([, init]) => init?.signal);
      expect(first).toBeInstanceOf(AbortSignal);
      expect(second).toBeInstanceOf(AbortSignal);
      expect(first).not.toBe(second);
    });
  });

  describe("reset and restarting", () => {
    it("forgets the parse and leaves no CV result in the query cache", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : done(readableResult)));
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(POLL_INTERVAL_MS * 2);
      expect(result.current.parse?.status).toBe("done");

      act(() => result.current.reset());
      await elapse(POLL_INTERVAL_MS * 3);

      expect(result.current.parse).toBeNull();
      const cached = JSON.stringify([
        client.getQueryCache().getAll().map((q) => q.state.data),
        client.getMutationCache().getAll().map((m) => m.state.data),
      ]);
      expect(cached).not.toContain(readableResult.contact.email);
      expect(cached).not.toContain("task");
    });

    it("ignores an upload that finishes after reset", async () => {
      let finishUpload!: () => void;
      const gate = new Promise<void>((resolve) => (finishUpload = resolve));
      mockFetch(async (_url, init) => {
        if (isUpload(init)) {
          await gate;
          return accepted("late");
        }
        return done(readableResult);
      });
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await settle();
      act(() => result.current.reset());
      finishUpload();
      await elapse(POLL_INTERVAL_MS * 3);

      expect(result.current.parse).toBeNull();
      expect(pollCalls()).toHaveLength(0);
    });

    it("lets a stale poll response from the old file not overwrite the new file's state", async () => {
      let finishOldPoll!: () => void;
      const oldGate = new Promise<void>((resolve) => (finishOldPoll = resolve));
      let uploads = 0;
      mockFetch(async (url, init) => {
        if (isUpload(init)) return accepted(`task-${++uploads}`);
        if (url.includes("task-1")) {
          await oldGate;
          return done(readableResult);
        }
        return pending();
      });
      const { result } = setup();

      act(() => result.current.start(pdf()));
      await settle();
      act(() => result.current.reset());
      act(() => result.current.start(pdf()));
      await settle();
      finishOldPoll();
      await elapse(POLL_INTERVAL_MS * 3);

      expect(result.current.parse).toEqual({ status: "processing" });
    });

    it("starting a second file without a reset also drops the first file's result", async () => {
      let finishOldPoll!: () => void;
      const oldGate = new Promise<void>((resolve) => (finishOldPoll = resolve));
      let uploads = 0;
      mockFetch(async (url, init) => {
        if (isUpload(init)) return accepted(`task-${++uploads}`);
        if (url.includes("task-1")) {
          await oldGate;
          return done(readableResult);
        }
        return pending();
      });
      const { result } = setup();

      act(() => result.current.start(pdf()));
      await settle();
      act(() => result.current.start(pdf()));
      await settle();
      finishOldPoll();
      await elapse(POLL_INTERVAL_MS * 3);

      expect(result.current.parse).toEqual({ status: "processing" });
    });

    it("clears a too-large failure when a valid file follows, and the reverse", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : pending()));
      const { result } = setup();
      act(() => result.current.start(pdf(MAX_UPLOAD_BYTES + 1)));
      expect(result.current.parse).toEqual({ status: "failed", reason: "too-large" });

      act(() => result.current.start(pdf()));
      await settle();
      expect(result.current.parse).toEqual({ status: "processing" });

      act(() => result.current.start(pdf(MAX_UPLOAD_BYTES + 1)));
      await settle();
      expect(result.current.parse).toEqual({ status: "failed", reason: "too-large" });
    });

    it("gives a new file a fresh pending timeout after a timed-out one", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : pending()));
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS + POLL_INTERVAL_MS * 2);
      expect(result.current.parse).toEqual({ status: "failed", reason: "timed-out" });

      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS / 2);
      expect(result.current.parse).toEqual({ status: "processing" });
    });
  });
});

describe("useAtsParse, round 2", () => {
  describe("what is sent", () => {
    it("sends nothing for a file that isn't a PDF, whatever its name and type say", async () => {
      const lies = [
        new File(["<html><script>1</script></html>"], "cv.pdf", { type: "application/pdf" }),
        new File(["plain text"], "cv.PDF", { type: "application/pdf" }),
        new File([""], "empty.pdf", { type: "application/pdf" }),
        new File(["%PDF"], "short.pdf", { type: "application/pdf" }),
      ];
      for (const file of lies) {
        mockFetch(() => accepted("never"));
        const { result, unmount } = setup();
        act(() => result.current.start(file));
        await elapse(POLL_INTERVAL_MS * 2);
        expect(result.current.parse).toEqual({ status: "failed", reason: "not-pdf" });
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
      }
    });

    it("sends a PDF whatever its name and type say", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : pending()));
      const { result } = setup();
      const file = new File(["%PDF-1.4 body"], "notes.txt", { type: "text/plain" });
      act(() => result.current.start(file));
      await settle();
      expect(uploadCalls()).toHaveLength(1);
    });

    it("sends nothing for an unreadable file and fails as an error", async () => {
      mockFetch(() => accepted("never"));
      const { result } = setup();
      act(() => result.current.start(unreadable()));
      await elapse(POLL_INTERVAL_MS * 2);
      expect(result.current.parse).toEqual({ status: "failed", reason: "error" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not send the user's file name", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : pending()));
      const { result } = setup();
      const name = "Jane Q Example - CV 2026.pdf";
      act(() => result.current.start(pdf(10, name)));
      await settle();

      const [, init] = uploadCalls()[0]!;
      const sent = (init?.body as FormData).get("file") as File;
      expect(sent.name).not.toBe(name);
      expect(sent.name).not.toContain("Jane");
      // The header the browser adds for the part carries the name too; nothing of it is in the form.
      expect(JSON.stringify([...(init?.body as FormData).entries()].map(([k, v]) => [k, (v as File).name]))).not.toContain("Jane");
      // The content still goes.
      expect(await sent.slice(0, 5).text()).toBe("%PDF-");
    });
  });

  describe("a header check in progress", () => {
    it("drops an older file when a newer one is started", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : pending()));
      const { result } = setup();
      const older = gated("older.pdf");
      act(() => result.current.start(older.file));
      act(() => result.current.start(pdf(20, "newer.pdf")));
      await settle();
      older.release();
      await elapse(POLL_INTERVAL_MS * 2);

      expect(uploadCalls()).toHaveLength(1);
      const sent = (uploadCalls()[0]![1]!.body as FormData).get("file") as File;
      expect(sent.size).toBe(20);
      expect(result.current.parse?.status).not.toBe("failed");
    });

    it("drops the file when reset is called before the check ends", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : pending()));
      const { result } = setup();
      const checking = gated("a.pdf");
      act(() => result.current.start(checking.file));
      act(() => result.current.reset());
      checking.release();
      await elapse(POLL_INTERVAL_MS * 3);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.parse).toBeNull();
    });

    it("drops an older non-PDF's failure when a newer file is started", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : pending()));
      const { result } = setup();
      const bad = new File(["nope"], "bad.pdf", { type: "application/pdf" });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const piece = bad.slice(0, 5);
      bad.slice = () => ({ text: async () => (await gate, piece.text()) }) as unknown as Blob;
      act(() => result.current.start(bad));
      act(() => result.current.start(pdf()));
      await settle();
      release();
      await elapse(POLL_INTERVAL_MS * 2);
      expect(result.current.parse).toEqual({ status: "processing" });
    });
  });

  describe("the timeout is final", () => {
    // A long gap between retries, so a 429 streak crosses MAX_PENDING_MS.
    const slowRetries = () => {
      client = new QueryClient({ defaultOptions: { queries: { retryDelay: MAX_PENDING_MS / 3 } } });
    };

    it("stays timed out after a 429 streak crosses the timeout, even if a later fetch would be done", async () => {
      slowRetries();
      let finished = false;
      mockFetch((_url, init) => {
        if (isUpload(init)) return accepted("t");
        return finished ? done(readableResult) : tooMany();
      });
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS + POLL_INTERVAL_MS * 2);
      expect(result.current.parse).toEqual({ status: "failed", reason: "timed-out" });

      finished = true;
      const before = pollCalls().length;
      await elapse(MAX_PENDING_MS * 3);
      expect(result.current.parse).toEqual({ status: "failed", reason: "timed-out" });
      expect(pollCalls()).toHaveLength(before);
    });

    it("stays timed out when a slow response arrives after the timeout", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      mockFetch(async (_url, init) => {
        if (isUpload(init)) return accepted("t");
        await gate;
        return done(readableResult);
      });
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS + POLL_INTERVAL_MS * 2);
      expect(result.current.parse).toEqual({ status: "failed", reason: "timed-out" });
      release();
      await elapse(POLL_INTERVAL_MS * 3);
      expect(result.current.parse).toEqual({ status: "failed", reason: "timed-out" });
    });

    it("a done before the timeout wins over it, and stays", async () => {
      slowRetries();
      let polls = 0;
      mockFetch((_url, init) => {
        if (isUpload(init)) return accepted("t");
        return ++polls <= 1 ? tooMany() : done(readableResult);
      });
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS / 2);
      expect(result.current.parse).toEqual({ status: "done", result: readableResult });
      await elapse(MAX_PENDING_MS * 2);
      expect(result.current.parse).toEqual({ status: "done", result: readableResult });
    });
  });

  describe("a failure is not undone by the browser", () => {
    afterEach(() => {
      focusManager.setFocused(undefined);
      onlineManager.setOnline(true);
    });

    it("stays failed after the window loses and regains focus and the network drops and returns", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : json({ detail: "gone" }, 404)));
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(POLL_INTERVAL_MS * 3);
      expect(result.current.parse?.status).toBe("failed");
      const failed = result.current.parse;
      const before = pollCalls().length;

      act(() => focusManager.setFocused(false));
      act(() => focusManager.setFocused(true));
      act(() => onlineManager.setOnline(false));
      act(() => onlineManager.setOnline(true));
      await elapse(POLL_INTERVAL_MS * 5);

      expect(result.current.parse).toEqual(failed);
      expect(pollCalls()).toHaveLength(before);
    });
  });

  describe("polling recovers", () => {
    it("ends done when a flaky poll recovers", async () => {
      let polls = 0;
      mockFetch((_url, init) => {
        if (isUpload(init)) return accepted("t");
        return ++polls <= 2 ? json({ detail: "bad gateway" }, 502) : done(readableResult);
      });
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS / 2);
      expect(result.current.parse).toEqual({ status: "done", result: readableResult });
    });

    it("ends as an error when a poll keeps failing with a 5xx, and stops asking", async () => {
      mockFetch((_url, init) => (isUpload(init) ? accepted("t") : json({ detail: "down" }, 503)));
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS / 2);
      expect(result.current.parse).toEqual({ status: "failed", reason: "error" });
      const before = pollCalls().length;
      await elapse(MAX_PENDING_MS);
      expect(pollCalls()).toHaveLength(before);
    });
  });
});

describe("useAtsParse, round 3", () => {
  describe("transient poll failures with the tab unfocused or hidden", () => {
    afterEach(() => {
      focusManager.setFocused(undefined);
      delete (document as unknown as Record<string, unknown>).visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const unfocus = {
      "the window unfocused": () => focusManager.setFocused(false),
      "the tab hidden": () => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      },
    };
    const transient = {
      "a 429": () => tooMany(),
      "a 502": () => json({ detail: "bad gateway" }, 502),
      "a dropped connection": () => {
        throw new TypeError("Failed to fetch");
      },
    };

    for (const [hiding, hide] of Object.entries(unfocus)) {
      for (const [failing, fail] of Object.entries(transient)) {
        it(`still ends done when the first poll fails with ${failing} and later ones are done, with ${hiding}`, async () => {
          hide();
          let polls = 0;
          mockFetch((_url, init) => {
            if (isUpload(init)) return accepted("t");
            return ++polls === 1 ? fail() : done(readableResult);
          });
          const { result } = setup();
          act(() => result.current.start(pdf()));
          await elapse(MAX_PENDING_MS / 2);
          expect(result.current.parse).toEqual({ status: "done", result: readableResult });
        });
      }
    }
  });

  describe("the 429 backoff", () => {
    const gapsOf = (times: number[]) => times.slice(1).map((t, i) => t - times[i]!);

    it("restarts after a successful poll", async () => {
      const script = ["429", "429", "429", "pending", "429", "pending", "done"];
      const times: number[] = [];
      const answers: string[] = [];
      mockFetch((_url, init) => {
        if (isUpload(init)) return accepted("t");
        times.push(Date.now());
        const answer = script[Math.min(times.length - 1, script.length - 1)]!;
        answers.push(answer);
        if (answer === "429") return tooMany();
        return answer === "pending" ? pending() : done(readableResult);
      });
      const { result } = setup();
      act(() => result.current.start(pdf()));
      await elapse(MAX_PENDING_MS - 5000);
      expect(result.current.parse).toEqual({ status: "done", result: readableResult });

      const gaps = gapsOf(times);
      // gaps[i] follows answer i.
      expect(gaps[1]!).toBeGreaterThan(gaps[0]!);
      expect(gaps[2]!).toBeGreaterThan(gaps[1]!);
      // After a pending answer: the normal interval.
      expect(gaps[3]).toBe(POLL_INTERVAL_MS);
      // The next 429 starts from the first step again, not from where the streak had got to.
      expect(gaps[4]).toBe(gaps[0]);
      expect(gaps[5]).toBe(POLL_INTERVAL_MS);
    });

    for (const how of ["start", "reset then start"] as const) {
      it(`is cleared by ${how === "start" ? "a new start()" : "reset() and a new start()"}: the next task's backoff begins from its first step`, async () => {
        let uploads = 0;
        const times: Record<string, number[]> = { "task-1": [], "task-2": [] };
        mockFetch((url, init) => {
          if (isUpload(init)) return accepted(`task-${++uploads}`);
          const task = url.includes("task-1") ? "task-1" : "task-2";
          times[task]!.push(Date.now());
          return tooMany();
        });
        const { result } = setup();
        act(() => result.current.start(pdf()));
        // Long enough for the backoff to have grown.
        await elapse(MAX_PENDING_MS / 2);
        const first = gapsOfTimes(times["task-1"]!);
        expect(first.at(-1)!).toBeGreaterThan(first[0]!);

        if (how === "reset then start") act(() => result.current.reset());
        act(() => result.current.start(pdf()));
        await elapse(MAX_PENDING_MS / 2);

        const second = gapsOfTimes(times["task-2"]!);
        expect(second.length).toBeGreaterThan(1);
        // Same schedule as a fresh file, not a continuation of the old streak.
        expect(second[0]).toBe(first[0]);
        expect(second.slice(0, 3)).toEqual(first.slice(0, 3));
      });
    }
  });
});

const gapsOfTimes = (times: number[]) => times.slice(1).map((t, i) => t - times[i]!);
