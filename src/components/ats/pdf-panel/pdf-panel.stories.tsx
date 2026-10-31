import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { samplePdf } from "@/components/ats/fixtures";

import { PdfPanel } from "./pdf-panel";

const meta: Meta<typeof PdfPanel> = {
  title: "ATS/PdfPanel",
  component: PdfPanel,
  loaders: [async () => ({ url: URL.createObjectURL(samplePdf()) })],
  render: (args, { loaded }) => (
    <div className={args.inline ? "h-120 w-lg" : "w-80"}>
      <PdfPanel {...args} url={loaded.url as string} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof PdfPanel>;

export const Inline: Story = {
  args: { inline: true, url: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByTitle("Your CV")).toHaveAttribute("src", expect.stringContaining("blob:"));
  },
};

export const LinkOnly: Story = {
  args: { inline: false, url: null },
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: "Open your PDF" });
    await expect(link).toHaveAttribute("target", "_blank");
  },
};

/** A dropped file that isn't a PDF is never shown. */
export const Unavailable: Story = {
  args: { inline: true, unavailable: true, url: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("There is no preview for this file.")).toBeVisible();
    await expect(canvas.queryByTitle("Your CV")).toBeNull();
  },
};
