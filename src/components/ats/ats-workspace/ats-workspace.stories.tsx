import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent } from "storybook/test";

import type { AtsParse } from "@/api/ats";
import { readableResult, samplePdf } from "@/components/ats/fixtures";

import { AtsWorkspace } from "./ats-workspace";

const meta: Meta<typeof AtsWorkspace> = {
  title: "ATS/AtsWorkspace",
  component: AtsWorkspace,
  args: { onReset: fn(), inlinePdf: true, fileUrl: null },
  parameters: {
    layout: "fullscreen",
    viewport: {
      options: {
        wide: { name: "Wide (1280)", styles: { width: "1280px", height: "800px" }, type: "desktop" },
        phone: { name: "Phone (390)", styles: { width: "390px", height: "844px" }, type: "mobile" },
      },
    },
  },
  loaders: [async () => ({ fileUrl: URL.createObjectURL(samplePdf()) })],
  render: (args, { loaded }) => (
    <div className="mx-auto h-160 w-full max-w-6xl p-4">
      <AtsWorkspace {...args} fileUrl={loaded.fileUrl as string} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof AtsWorkspace>;

export const Uploading: Story = { args: { parse: { status: "uploading" } } };

export const Processing: Story = { args: { parse: { status: "processing" } } };

export const Done: Story = { args: { parse: { status: "done", result: readableResult } } };

export const Failed: Story = { args: { parse: { status: "failed", reason: "encrypted" } } };

/** Phones: the output first, then a link to open the PDF. */
export const Stacked: Story = {
  args: { parse: { status: "done", result: readableResult }, inlinePdf: false },
};

const STEPS: AtsParse[] = [{ status: "uploading" }, { status: "processing" }, { status: "done", result: readableResult }];

/** Goes through the states of one upload, a step per click on the button below, the way a real one does. */
const ThroughTheStates = (props: Omit<ComponentProps<typeof AtsWorkspace>, "parse">) => {
  const [step, setStep] = useState(0);
  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="h-160">
        <AtsWorkspace {...props} parse={STEPS[step]} />
      </div>
      <button type="button" className="mt-4 text-sm underline" onClick={() => setStep((s) => Math.min(s + 1, 2))}>
        Next state (story only)
      </button>
    </div>
  );
};

/**
 * Wide screens: nothing below the status bar moves from the upload to a readable result (a pass, with its extra note
 * line), and neither does the status heading. On phones the note may wrap to two lines while one is reserved, so
 * there's no phone version: a one-line shift is accepted there.
 */
export const NoShiftWide: Story = {
  globals: { viewport: { value: "wide" } },
  args: { inlinePdf: true },
  render: (args, { loaded }) => <ThroughTheStates {...args} fileUrl={loaded.fileUrl as string} />,
  play: async ({ canvas, canvasElement }) => {
    const width = canvasElement.ownerDocument.documentElement.clientWidth;
    // The viewport really is the one under test (the breakpoints are media queries).
    await expect(Math.abs(width - 1280)).toBeLessThan(20);

    // The heading, and the PDF's frame: the first thing in the content under the bar.
    const tops = async (name: RegExp) => ({
      heading: (await canvas.findByRole("heading", { level: 2, name })).getBoundingClientRect().top,
      below: canvas.getByTitle("Your CV").getBoundingClientRect().top,
    });
    const next = canvas.getByRole("button", { name: /next state/i });

    const uploading = await tops(/Uploading your CV/);
    await userEvent.click(next);
    const processing = await tops(/Reading your CV/);
    await userEvent.click(next);
    const done = await tops(/found your details/);
    // A readable pass, so the note line is there.
    await expect(canvas.getByText(/compare the text with your pdf/i)).toBeVisible();

    for (const key of ["heading", "below"] as const) {
      await expect(Math.abs(processing[key] - uploading[key])).toBeLessThanOrEqual(1);
      await expect(Math.abs(done[key] - uploading[key])).toBeLessThanOrEqual(1);
    }
  },
};
