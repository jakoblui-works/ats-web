import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { readableResult, samplePdf } from "@/components/ats/fixtures";

import { AtsWorkspace } from "./ats-workspace";

const meta: Meta<typeof AtsWorkspace> = {
  title: "ATS/AtsWorkspace",
  component: AtsWorkspace,
  args: { onReset: fn(), inlinePdf: true, fileUrl: null },
  parameters: { layout: "fullscreen" },
  loaders: [async () => ({ fileUrl: URL.createObjectURL(samplePdf()) })],
  render: (args, { loaded }) => (
    <div className="mx-auto h-160 w-full max-w-6xl p-4">
      <AtsWorkspace {...args} fileUrl={loaded.fileUrl as string} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof AtsWorkspace>;

export const Processing: Story = { args: { parse: { status: "processing" } } };

export const Done: Story = { args: { parse: { status: "done", result: readableResult } } };

/** Phones: the output first, then a link to open the PDF. */
export const Stacked: Story = {
  args: { parse: { status: "done", result: readableResult }, inlinePdf: false },
};
