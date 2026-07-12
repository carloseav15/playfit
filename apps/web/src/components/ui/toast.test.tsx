import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toast } from "./toast";

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  it("renders nothing while closed", () => {
    render(<Toast message="Saved" onDismiss={vi.fn()} open={false} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismisses after its configured duration", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast duration={1000} message="Saved" onDismiss={onDismiss} open />);

    act(() => vi.advanceTimersByTime(1000));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("pauses its dismiss timer while hovered", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast duration={1000} message="Saved" onDismiss={onDismiss} open />);

    const toast = screen.getByRole("status");
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(1000));
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(1000));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("runs an action and then dismisses", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toast
        actionLabel="Undo change"
        message="Saved"
        onAction={onAction}
        onDismiss={onDismiss}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "Undo change" }));

    expect(onAction).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("shows Retry only for an error toast", () => {
    const onRetry = vi.fn();
    render(
      <Toast message="Save failed" onDismiss={vi.fn()} onRetry={onRetry} open variant="error" />,
    );

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
