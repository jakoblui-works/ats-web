import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { OgCard } from "./og-card";

const meta: Meta<typeof OgCard> = {
  title: "OgCard",
  component: OgCard,
  // `pnpm og` screenshots this story to public/og.png.
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof OgCard>;

export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: /read your CV\?/ })).toBeVisible();
    await expect(canvas.getByText(/in your browser/)).toBeVisible();

    // The size og:image:width/height in index.html declare.
    const card = canvasElement.querySelector("[data-og-card]")!;
    await expect(card.getBoundingClientRect()).toMatchObject({ width: 1200, height: 630 });
  },
};
