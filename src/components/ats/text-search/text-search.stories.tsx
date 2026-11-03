import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";

import { readableResult } from "@/components/ats/fixtures";

import { TextSearch } from "./text-search";

const meta: Meta<typeof TextSearch> = {
  title: "ATS/TextSearch",
  component: TextSearch,
  args: { text: readableResult.text },
  decorators: [
    (Story) => (
      <div className="w-xl">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TextSearch>;

export const Empty: Story = {};

export const Found: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("searchbox"), "python");
    await expect(canvas.getByTestId("search-result")).toHaveTextContent("A simple parser would find this: 1 match");
  },
};

export const NotFound: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("searchbox"), "Kubernetes");
    await expect(canvas.getByTestId("search-result")).toHaveTextContent("A simple parser wouldn't find this");
  },
};
