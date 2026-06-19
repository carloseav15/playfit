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

        if (isSignUp && !data.session) {
          setSuccess("Please check your email to verify your account.");
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

  const handleGoogleSignIn = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(authError.message);
        setBusy(false);
      }
    } catch {
      setError("Connection error. Please try again.");
      setBusy(false);
    }
  }, []);

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

        <div className="relative flex items-center justify-center py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <span className="relative bg-card px-2 text-xs text-muted-foreground uppercase">
            Or continue with
          </span>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignIn}
          disabled={busy}
          loading={busy}
          className="w-full gap-3 hover:bg-secondary/40"
        >
          {!busy && (
            <svg
              className="size-4 shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
              role="img"
              aria-label="Google"
            >
              <title>Google Logo</title>
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
          )}
          Google
        </Button>

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
