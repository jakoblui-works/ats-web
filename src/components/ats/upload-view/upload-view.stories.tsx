import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";

import { UploadView } from "./upload-view";

const meta: Meta<typeof UploadView> = {
  title: "ATS/UploadView",
  component: UploadView,
  args: { onFile: fn() },
  decorators: [
    (Story) => (
      <div className="w-5xl">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof UploadView>;

/** Idle: the page before an upload, with its one primary button. */
export const Idle: Story = {
  play: async ({ args, canvas, canvasElement }) => {
    await expect(canvas.getByRole("button", { name: "Upload CV" })).toBeVisible();
    await expect(canvas.getByText(/deleted right after/)).toBeVisible();
    await expect(canvas.getByText(/English or Danish/)).toBeVisible();
    await expect(canvas.getByText("Drop your CV here")).toBeVisible();

    const file = new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" });
    await userEvent.upload(canvasElement.querySelector<HTMLInputElement>("input[type=file]")!, file);
    await expect(args.onFile).toHaveBeenCalledWith(file);
  },
};

/** A file is being dragged over the page. */
export const Dragging: Story = {
  args: { dragging: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector("[data-dragging]")).not.toBeNull();
    await expect(canvas.getByText("Drop your PDF to read it")).toBeVisible();
  },
};

/** Coming back from a result: the button has focus. */
export const FocusButton: Story = {
  args: { focusButton: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Upload CV" })).toHaveFocus();
  },
};

/** Without the prop, nothing is focused for the visitor. */
export const NoFocusByDefault: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Upload CV" })).not.toHaveFocus();
  },
};
