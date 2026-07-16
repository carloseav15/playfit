import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      signInWithOAuth: mocks.signInWithOAuth,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  },
}));

vi.mock("next/image", () => ({
  default: () => <span data-testid="auth-logo" />,
}));

import { AuthPanel } from "./auth-panel";

describe("AuthPanel", () => {
  beforeEach(() => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "token-1" } },
      error: null,
    });
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    });
    mocks.signInWithOAuth.mockResolvedValue({ error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the three authentication entry points", () => {
    render(<AuthPanel onAuth={vi.fn()} onContinueLocal={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue as Guest" })).toBeInTheDocument();
  });

  it("authenticates with email and reports the user to the parent", async () => {
    const user = userEvent.setup();
    const onAuth = vi.fn();
    render(<AuthPanel onAuth={onAuth} onContinueLocal={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Continue with Email" }));
    await user.type(
      await screen.findByRole("textbox", { name: /Email Address/ }),
      "player@example.com",
    );
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "player@example.com",
      password: "secret123",
    });
    expect(onAuth).toHaveBeenCalledWith("user-1", "player@example.com");
  });

  it("asks the user to verify email after a signup without a session", async () => {
    const user = userEvent.setup();
    render(<AuthPanel onAuth={vi.fn()} onContinueLocal={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "New to Playfit? Create account" }));
    await user.type(
      await screen.findByRole("textbox", { name: /Email Address/ }),
      "new@example.com",
    );
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "secret123",
      options: { emailRedirectTo: expect.any(String) },
    });
    expect(
      await screen.findByText("Please check your email to verify your account."),
    ).toBeInTheDocument();
  });

  it("shows the provider error when email authentication fails", async () => {
    const user = userEvent.setup();
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });
    render(<AuthPanel onAuth={vi.fn()} onContinueLocal={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Continue with Email" }));
    await user.type(
      await screen.findByRole("textbox", { name: /Email Address/ }),
      "bad@example.com",
    );
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
  });

  it("requests a password reset for the entered email", async () => {
    const user = userEvent.setup();
    render(<AuthPanel onAuth={vi.fn()} onContinueLocal={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Continue with Email" }));
    await user.type(
      await screen.findByRole("textbox", { name: /Email Address/ }),
      "reset@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("reset@example.com", {
      redirectTo: expect.stringContaining("/auth/callback?next=/auth/reset-password"),
    });
    expect(
      await screen.findByText("If that email is registered, you'll receive a reset link shortly."),
    ).toBeInTheDocument();
  });

  it("starts Google OAuth from the options view", async () => {
    const user = userEvent.setup();
    render(<AuthPanel onAuth={vi.fn()} onContinueLocal={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: expect.stringContaining("/auth/callback") },
    });
  });
});
