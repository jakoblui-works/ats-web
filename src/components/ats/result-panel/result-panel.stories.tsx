import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import type { AtsFailureReason } from "@/parser/use-ats-parse";
import { invisibleResult, partialResult, readableResult } from "@/components/ats/fixtures";

import { ResultPanel } from "./result-panel";

const meta: Meta<typeof ResultPanel> = {
  title: "ATS/ResultPanel",
  component: ResultPanel,
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

export const Loading: Story = {
  args: { parse: { status: "loading" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Preparing the parser");
  },
};

export const Processing: Story = {
  args: { parse: { status: "processing" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Reading your CV");
  },
};

export const Readable: Story = {
  args: { parse: { status: "done", result: readableResult } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("alex@example.com")).toBeVisible();
    await expect(canvas.getByRole("status")).toBeEmptyDOMElement();
  },
};

export const Partial: Story = {
  args: { parse: { status: "done", result: partialResult } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Things to look at")).toBeVisible();
    // Missing fields are shown as missing.
    await expect(canvas.getAllByText("Not found").length).toBeGreaterThan(0);
  },
};

export const Invisible: Story = {
  args: { parse: { status: "done", result: invisibleResult } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Things to look at")).toBeVisible();
    await expect(canvas.queryByRole("tab")).toBeNull();
  },
};

/** What each failure's message is about. They must not overlap, so no two reasons can share a message. */
const MESSAGE_TOPICS: Record<AtsFailureReason, RegExp> = {
  "too-large": /too large/i,
  "not-pdf": /doesn't look like a pdf/i,
  "too-many-pages": /too many pages/i,
  encrypted: /password/i,
  corrupt: /damaged|couldn't be read/i,
  "timed-out": /taking too long/i,
  error: /went wrong/i,
};

/** The reason, and nothing else: the privacy note and the way back are the bar's (one of each on the page). */
const failure = (reason: AtsFailureReason): Story => ({
  args: { parse: { status: "failed", reason } },
  play: async ({ canvas }) => {
    const alert = canvas.getByRole("alert");
    await expect(alert).toBeVisible();
    // Its own message, and none of the other reasons'.
    for (const [other, topic] of Object.entries(MESSAGE_TOPICS)) {
      if (other === reason) await expect(alert).toHaveTextContent(topic);
      else await expect(alert).not.toHaveTextContent(topic);
    }
    await expect(canvas.queryByText(/never leaves your device/)).toBeNull();
    await expect(canvas.queryByRole("button")).toBeNull();
  },
});

export const TooLarge = failure("too-large");
export const NotPdf = failure("not-pdf");
export const TooManyPages = failure("too-many-pages");
export const Encrypted = failure("encrypted");
export const Corrupt = failure("corrupt");
export const TimedOut = failure("timed-out");
export const Error = failure("error");
