import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";

import { invisibleResult, partialResult, readableResult } from "@/components/ats/fixtures";

import { ResultBar } from "./result-bar";

const meta: Meta<typeof ResultBar> = {
  title: "ATS/ResultBar",
  component: ResultBar,
  args: { onReset: fn(), parse: { status: "done", result: readableResult } },
};
export default meta;

type Story = StoryObj<typeof ResultBar>;

export const Loading: Story = {
  args: { parse: { status: "loading" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 2, name: /Preparing the parser/ })).toBeVisible();
    await expect(canvas.getByText(/never leaves your device/)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Check another CV" })).toBeVisible();
  },
};

export const Processing: Story = {
  args: { parse: { status: "processing" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 2, name: /Reading your CV/ })).toBeVisible();
    await expect(canvas.getByText(/never leaves your device/)).toBeVisible();
  },
};

export const Readable: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("heading", { name: "A simple parser found your details" })).toBeVisible();
    await expect(canvas.getByText(/Compare the text with your PDF/)).toBeVisible();
    await expect(canvas.getByText(/never leaves your device/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Check another CV" }));
    await expect(args.onReset).toHaveBeenCalled();
  },
};

export const SomethingMissing: Story = {
  args: {
    parse: { status: "done", result: { ...readableResult, contact: { ...readableResult.contact, phone: null } } },
  },
};
export const Partial: Story = { args: { parse: { status: "done", result: partialResult } } };
export const Invisible: Story = { args: { parse: { status: "done", result: invisibleResult } } };

/** Every failure still carries the privacy note. */
export const FailedStored: Story = {
  args: { parse: { status: "failed", reason: "encrypted" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(canvas.getByText(/never leaves your device/)).toBeVisible();
  },
};

export const FailedTurnedAway: Story = {
  args: { parse: { status: "failed", reason: "too-large" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(canvas.getByText(/never leaves your device/)).toBeVisible();
  },
};
