import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";

import { invisibleResult, partialResult, readableResult } from "@/components/ats/fixtures";

import { ResultBar } from "./result-bar";

const meta: Meta<typeof ResultBar> = {
  title: "ATS/ResultBar",
  component: ResultBar,
  args: { onReset: fn(), result: readableResult },
};
export default meta;

type Story = StoryObj<typeof ResultBar>;

export const Readable: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("heading", { name: "A simple parser found your details" })).toHaveFocus();
    await expect(canvas.getByText(/Compare the text with your PDF/)).toBeVisible();
    await expect(canvas.getByText(/expires within an hour/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Check another CV" }));
    await expect(args.onReset).toHaveBeenCalled();
  },
};

export const SomethingMissing: Story = {
  args: { result: { ...readableResult, contact: { ...readableResult.contact, phone: null } } },
};
export const Partial: Story = { args: { result: partialResult } };
export const Invisible: Story = { args: { result: invisibleResult } };
