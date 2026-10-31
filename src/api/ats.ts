import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/fetcher";
import { atsParseStatus, useAtsParseStatus, useAtsUpload } from "@/api/generated/ats/ats";
import { looksLikePdf } from "@/lib/pdf";
import type { ParseResultOutput, ParseStatusResponseOutput } from "@/api/generated/model";

/** The api's upload limit. Only used to skip a request that can't succeed; the api's 413 still counts. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** How long a task may stay pending, from when its task id arrived, before the parse counts as timed out. */
export const MAX_PENDING_MS = 60 * 1000;

/** How long the upload request may take before it counts as timed out: only there to catch a hang, so a slow link can still send 5 MB. */
export const UPLOAD_TIMEOUT_MS = 120 * 1000;

export const POLL_INTERVAL_MS = 1000;

const MAX_STATUS_RETRIES = 2;

/** The longest wait between polls while the api keeps answering 429. */
const MAX_RATE_LIMIT_BACKOFF_MS = 16 * 1000;

/** Whether a poll that failed other than with a 429 should be asked again. `failures` counts them in a row, this one included. A 4xx is the api's final answer. */
const shouldPollAgain = (failures: number, error: unknown): boolean => {
  const requestError = error instanceof ApiError && error.status > 399 && error.status < 500;
  return !requestError && failures <= MAX_STATUS_RETRIES;
};

/** The wait before the next poll after `rateLimited` 429s in a row: doubles from the normal interval, up to a cap. */
const pollInterval = (rateLimited: number): number =>
  Math.min(POLL_INTERVAL_MS * 2 ** rateLimited, MAX_RATE_LIMIT_BACKOFF_MS);

export type AtsFailureReason =
  | "rate-limited"
  | "too-large"
  | "not-pdf"
  | "too-many-pages"
  | "encrypted"
  | "corrupt"
  | "timed-out"
  | "error";

export type AtsParse =
  | { status: "uploading" }
  | { status: "processing" }
  | { status: "done"; result: ParseResultOutput }
  | { status: "failed"; reason: AtsFailureReason };

/** Why a request failed, from the error `customFetch` threw. */
export const requestFailureReason = (error: unknown): AtsFailureReason => {
  // The upload's `AbortSignal.timeout` rejects with a `TimeoutError`.
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError"))
    return "timed-out";
  if (!(error instanceof ApiError)) return "error";
  if (error.status === 429) return "rate-limited";
  if (error.status === 413) return "too-large";
  if (error.status === 415) return "not-pdf";
  return "error";
};

/** Why the worker rejected the file, from the status response's `reason` (absent or null counts as unknown). */
export const rejectionReason = (reason: ParseStatusResponseOutput["reason"]): AtsFailureReason => {
  switch (reason) {
    case "too_many_pages":
      return "too-many-pages";
    case "encrypted":
      return "encrypted";
    case "corrupt":
      return "corrupt";
    case "timed_out":
      return "timed-out";
    default:
      return "error";
  }
};

type ParseInputs = {
  /** A failure known without asking the api (the file is over the limit). */
  clientFailure: AtsFailureReason | null;
  uploadError: Error | null;
  uploadedTaskId: string | undefined;
  statusError: Error | null;
  status: ParseStatusResponseOutput | undefined;
  /** The task was still pending after `MAX_PENDING_MS`. */
  timedOut: boolean;
};

/** What the page shows, from what the upload and the polling have produced so far. */
export const toParse = (inputs: ParseInputs): AtsParse => {
  const { clientFailure, uploadError, uploadedTaskId, statusError, status, timedOut } = inputs;
  if (clientFailure) return { status: "failed", reason: clientFailure };
  if (uploadError) return { status: "failed", reason: requestFailureReason(uploadError) };
  if (uploadedTaskId === undefined) return { status: "uploading" };
  if (statusError) return { status: "failed", reason: requestFailureReason(statusError) };

  if (status?.state === "failed") return { status: "failed", reason: rejectionReason(status.reason) };
  if (status?.state === "done") {
    // `result` is optional as well as nullable in the generated type; either way it's absent.
    return status.result
      ? { status: "done", result: status.result }
      : { status: "failed", reason: "error" };
  }
  // An unknown task stays pending for ever, so the timeout is the only way out.
  if (timedOut) return { status: "failed", reason: "timed-out" };
  return { status: "processing" };
};

/** Uploads a file, then polls its parse until it ends or `MAX_PENDING_MS` passes. */
export const useAtsParse = (): {
  parse: AtsParse | null;
  /** Starts over with a new file. */
  start: (file: File) => void;
  /** Forgets the current file's parse. */
  reset: () => void;
} => {
  const queryClient = useQueryClient();
  const upload = useAtsUpload({
    // `atsUpload` spreads these options when the request starts, so the getter makes a fresh
    // deadline for every upload rather than one fixed when the hook was created.
    request: {
      get signal() {
        return AbortSignal.timeout(UPLOAD_TIMEOUT_MS);
      },
    },
    mutation: {
      // Offline, a mutation would otherwise pause with no way out; the deadline ends it.
      networkMode: "always",
      // Nothing of the CV stays cached once it's forgotten.
      gcTime: 0,
    },
  });
  const [started, setStarted] = useState(false);
  const [clientFailure, setClientFailure] = useState<AtsFailureReason | null>(null);
  const [timedOutTask, setTimedOutTask] = useState<string | null>(null);

  const taskId = upload.data?.data.task_id;

  useEffect(() => {
    if (taskId === undefined) return;
    const timer = setTimeout(() => setTimedOutTask(taskId), MAX_PENDING_MS);
    return () => clearTimeout(timer);
  }, [taskId]);

  const timedOut = taskId !== undefined && timedOutTask === taskId;

  // Polls that failed in a row, for the current file: 429s apart from the rest. Cleared by `start` and `reset`.
  const pollFailures = useRef(0);
  const rateLimited = useRef(0);

  const statusQuery = useAtsParseStatus(taskId ?? "", {
    query: {
      enabled: taskId !== undefined && !timedOut,
      // Polling is the only fetch path: a refetch on focus or reconnect would undo a failure.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      gcTime: 0,
      networkMode: "always",
      // The retryer is off: it pauses its retries while the tab is unfocused, whatever `networkMode`
      // says, so the wall-clock timeout below could end a poll that was never asked again. A transient
      // failure is instead answered as "still pending" by `queryFn`, and the interval, which also runs in
      // a hidden tab, asks again. A 429 says nothing about the parse (the api's limit also counts polls),
      // so it never uses up a budget: the polls back off and the client timeout is the way out. Any other
      // failure reaches the query as an error once its small budget is spent.
      retry: false,
      queryFn: async ({ signal }) => {
        try {
          const response = await atsParseStatus(taskId ?? "", { signal });
          pollFailures.current = 0;
          rateLimited.current = 0;
          return response;
        } catch (error) {
          if (error instanceof ApiError && error.status === 429) rateLimited.current++;
          else {
            rateLimited.current = 0;
            if (!shouldPollAgain(++pollFailures.current, error)) throw error;
          }
          return { data: { state: "pending" }, status: 200, headers: new Headers() } as const;
        }
      },
      refetchIntervalInBackground: true,
      // Stops once the parse has ended, on an error (a failed query keeps its last data) and at the timeout.
      refetchInterval: (query) =>
        !timedOut && query.state.status !== "error" && query.state.data?.data.state === "pending"
          ? pollInterval(rateLimited.current)
          : false,
    },
  });

  // The client timeout is final: whatever is still in flight (a retrying 429, a slow response)
  // is cancelled, so the screen can't change afterwards. A `done` that came earlier still wins.
  const statusKey = statusQuery.queryKey;
  useEffect(() => {
    if (timedOut) void queryClient.cancelQueries({ queryKey: statusKey });
  }, [timedOut, queryClient, statusKey]);

  const { mutate, reset: resetUpload } = upload;
  // Counts starts and resets, so a file still being checked is dropped if the page moved on.
  const generation = useRef(0);

  const start = (file: File) => {
    const mine = ++generation.current;
    setTimedOutTask(null);
    pollFailures.current = 0;
    rateLimited.current = 0;
    resetUpload();
    setClientFailure(null);
    setStarted(true);
    if (file.size > MAX_UPLOAD_BYTES) {
      setClientFailure("too-large");
      return;
    }
    // Nothing is sent for a file that isn't a PDF, or that can't be read. The api's 415 stays the real check.
    looksLikePdf(file).then(
      (isPdf) => {
        if (generation.current !== mine) return;
        if (!isPdf) setClientFailure("not-pdf");
        // The file name never goes out: it can say more than the CV does.
        else mutate({ data: { file: new File([file], "cv.pdf", { type: file.type }) } });
      },
      () => {
        if (generation.current === mine) setClientFailure("error");
      },
    );
  };

  const reset = () => {
    generation.current++;
    pollFailures.current = 0;
    rateLimited.current = 0;
    resetUpload();
    setClientFailure(null);
    setTimedOutTask(null);
    setStarted(false);
  };

  return {
    parse: started
      ? toParse({
          clientFailure,
          uploadError: upload.error,
          uploadedTaskId: taskId,
          statusError: statusQuery.error,
          status: statusQuery.data?.data,
          timedOut,
        })
      : null,
    start,
    reset,
  };
};
