"use client";

import type React from "react";
import { useCallback, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField, FormLabel } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";

interface AuthPanelProps {
  onAuth: (userId: string, email: string) => void;
  onContinueLocal: () => void;
}

export function AuthPanel({ onAuth, onContinueLocal }: AuthPanelProps) {
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
          <FormField>
            <FormLabel htmlFor="auth-email">Email</FormLabel>
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
          </FormField>
          <FormField>
            <FormLabel htmlFor="auth-password">Password</FormLabel>
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
          </FormField>

          {error && <Alert variant="error">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}

          <Button type="submit" disabled={busy} loading={busy}>
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

        <div className="grid gap-2 border-t border-border pt-4 text-left">
          <Button type="button" variant="secondary" onClick={onContinueLocal}>
            Continue locally
          </Button>
          <p className="text-xs text-muted-foreground">
            Local profiles use a browser device ID. They are convenient for private testing but are
            not a strong identity boundary.
          </p>
        </div>
      </div>
    </main>
  );
}
