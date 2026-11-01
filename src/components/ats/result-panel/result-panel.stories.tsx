import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";

import type { AtsFailureReason } from "@/api/ats";
import { invisibleResult, partialResult, readableResult } from "@/components/ats/fixtures";

import { ResultPanel } from "./result-panel";

const meta: Meta<typeof ResultPanel> = {
  title: "ATS/ResultPanel",
  component: ResultPanel,
  args: { onReset: fn() },
  decorators: [
    (Story) => (
      <div className="w-xl">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof ResultPanel>;

export const Uploading: Story = {
  args: { parse: { status: "uploading" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Uploading…")).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("Uploading your CV");
  },
};

export const Processing: Story = {
  args: { parse: { status: "processing" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Reading your CV…")).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("Reading your CV");
  },
};

export const Readable: Story = {
  args: { parse: { status: "done", result: readableResult } },
  play: async ({ args, canvas }) => {
    const heading = canvas.getByRole("heading", { name: /a simple parser can read this text/i });
    await expect(heading).toBeVisible();
    // Focus moves to the verdict when the result arrives.
    await expect(heading).toHaveFocus();
    // Focus on the verdict announces it, so the live region stays quiet.
    await expect(canvas.getByRole("status")).toBeEmptyDOMElement();
    await expect(canvas.getByText("alex@example.com")).toBeVisible();
    await expect(canvas.getByText(/expires within an hour/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Check another CV" }));
    await expect(args.onReset).toHaveBeenCalled();
  },
};

export const Partial: Story = {
  args: { parse: { status: "done", result: partialResult } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: /only part of this/i })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "What it picked out" })).toBeVisible();
    await expect(canvas.getAllByText("Not found").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Things to look at")).toBeVisible();
    // Missing fields are shown as missing.
    await expect(canvas.getAllByText("Not found").length).toBeGreaterThan(0);
  },
};

export const Invisible: Story = {
  args: { parse: { status: "done", result: invisibleResult } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: /see nothing here/i })).toBeVisible();
  },
};

/** What each failure's message is about. They must not overlap, so no two reasons can share a message. */
const MESSAGE_TOPICS: Record<AtsFailureReason, RegExp> = {
  "rate-limited": /too many requests/i,
  "too-large": /too large/i,
  "not-pdf": /doesn't look like a pdf/i,
  "too-many-pages": /too many pages/i,
  encrypted: /password/i,
  corrupt: /damaged|couldn't be read/i,
  "timed-out": /taking too long/i,
  error: /went wrong/i,
};

/** Failures after the file was stored say it was deleted; ones that turned it away don't. */
const failure = (reason: AtsFailureReason, stored = false): Story => ({
  args: { parse: { status: "failed", reason } },
  play: async ({ args, canvas }) => {
    const alert = canvas.getByRole("alert");
    await expect(alert).toBeVisible();
    // Its own message, and none of the other reasons'.
    for (const [other, topic] of Object.entries(MESSAGE_TOPICS)) {
      if (other === reason) await expect(alert).toHaveTextContent(topic);
      else await expect(alert).not.toHaveTextContent(topic);
    }
    if (stored) await expect(canvas.getByText(/deleted right after/)).toBeVisible();
    else await expect(canvas.queryByText(/deleted right after/)).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Try another file" }));
    await expect(args.onReset).toHaveBeenCalled();
  },
});

export const RateLimited = failure("rate-limited");
export const TooLarge = failure("too-large");
export const NotPdf = failure("not-pdf");
export const TooManyPages = failure("too-many-pages", true);
export const Encrypted = failure("encrypted", true);
export const Corrupt = failure("corrupt", true);
export const TimedOut = failure("timed-out");
export const Error = failure("error");
