import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UploadView } from "./upload-view";

const pdf = () => new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" });

describe("UploadView", () => {
  it("has copy outside the drop area, and the Upload button inside it as the only primary button", () => {
    const { container } = render(<UploadView onFile={vi.fn()} />);
    const area = container.querySelector<HTMLElement>("div.border-dashed")!;
    const heading = screen.getByRole("heading", { level: 1 });
    expect(area).not.toContainElement(heading);
    expect(area).not.toContainElement(screen.getByText(/most\s+ATS will too/));
    expect(area).not.toContainElement(screen.getByText(/deleted right after/));
    expect(area).toContainElement(screen.getByRole("button", { name: "Upload CV" }));
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("marks the area while a file is dragged, and not otherwise", () => {
    const { container, rerender } = render(<UploadView onFile={vi.fn()} />);
    expect(container.querySelector("[data-dragging]")).toBeNull();
    rerender(<UploadView onFile={vi.fn()} dragging />);
    expect(container.querySelector("[data-dragging]")).not.toBeNull();
  });

  it("passes the chosen file on once, whether the area or the button was clicked", () => {
    const onFile = vi.fn();
    const { container } = render(<UploadView onFile={onFile} />);
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    const opened = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Upload CV" }));
    expect(opened).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Drop your CV here"));
    expect(opened).toHaveBeenCalledTimes(2);
    const file = pdf();
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledExactlyOnceWith(file);
  });
});
