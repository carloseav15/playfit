"use client";

import { supabase } from "@playfit/core";
import type React from "react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuthPanelProps {
  onAuth: (userId: string, email: string) => void;
}

export function AuthPanel({ onAuth }: AuthPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setBusy(true);

      try {
        const fn = isSignUp
          ? supabase.auth.signUp({ email, password })
          : supabase.auth.signInWithPassword({ email, password });

        const { data, error: authError } = await fn;

        if (authError) {
          setError(authError.message);
          return;
        }

        const userId = data.user?.id;
        if (userId) {
          onAuth(userId, email);
        } else {
          setError("Could not authenticate. Check your credentials.");
        }
      } catch {
        setError("Connection error. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [email, password, isSignUp, onAuth],
  );

  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div className="grid max-w-sm gap-6 rounded-lg border border-border bg-card p-8">
        <div className="grid gap-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Playfit
          </p>
          <h1 className="font-display text-3xl font-extrabold">
            {isSignUp ? "Create Account" : "Sign In"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSignUp
              ? "Create an account so Playfit remembers your library."
              : "Sign in to pick up where you left off."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3 text-left">
          <div className="grid gap-1">
            <label
              htmlFor="auth-email"
              className="text-xs font-bold uppercase tracking-wide text-muted-foreground"
            >
              Email
            </label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>
          <div className="grid gap-1">
            <label
              htmlFor="auth-password"
              className="text-xs font-bold uppercase tracking-wide text-muted-foreground"
            >
              Password
            </label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg bg-positive/10 px-3 py-2 text-xs text-positive">{success}</p>
          )}

          <Button type="submit" disabled={busy}>
            {busy
              ? isSignUp
                ? "Creating account…"
                : "Signing in…"
              : isSignUp
                ? "Create Account"
                : "Sign In"}
          </Button>

          {!isSignUp && (
            <button
              type="button"
              onClick={async () => {
                if (!email) {
                  setError("Enter your email address first.");
                  return;
                }
                setError(null);
                setSuccess(null);
                setBusy(true);
                const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/app`,
                });
                setBusy(false);
                if (resetError) {
                  setError(resetError.message);
                } else {
                  setSuccess("If that email is registered, you'll receive a reset link shortly.");
                }
              }}
              className="text-xs text-muted-foreground underline transition-colors hover:text-foreground"
            >
              Forgot password?
            </button>
          )}
        </form>

        <button
          type="button"
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-xs text-muted-foreground underline transition-colors hover:text-foreground"
        >
          {isSignUp ? "Already have an account? Sign in" : "No account? Create one"}
        </button>
      </div>
    </main>
  );
}
