"use client";

import type React from "react";
import { useCallback, useState } from "react";
import { buildSiteUrl } from "@/lib/site-url";
import { supabase } from "@/lib/supabase/client";

export type AuthView = "options" | "signin" | "signup";

interface UseAuthPanelOptions {
  onAuth: (userId: string, email: string) => void;
}

export function useAuthPanel({ onAuth }: UseAuthPanelOptions) {
  const [view, setView] = useState<AuthView>("options");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const handleSwitchView = useCallback(
    (nextView: AuthView) => {
      clearMessages();
      setView(nextView);
    },
    [clearMessages],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      clearMessages();
      setBusy(true);

      const isSignUp = view === "signup";

      try {
        const fn = isSignUp
          ? supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: buildSiteUrl("/auth/callback") },
            })
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
        if (!userId) {
          setError("Could not authenticate. Check your credentials.");
          return;
        }

        if (data.session?.access_token) {
          try {
            await fetch("/api/auth/mark-returning", {
              method: "POST",
              headers: { authorization: `Bearer ${data.session.access_token}` },
            });
          } catch {
            // Best-effort -- only smooths out the next visit to "/", never blocks sign-in.
          }
        }
        onAuth(userId, email);
      } catch {
        setError("Connection error. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [clearMessages, email, onAuth, password, view],
  );

  const handleGoogleSignIn = useCallback(async () => {
    clearMessages();
    setBusy(true);

    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: buildSiteUrl("/auth/callback") },
      });

      if (authError) setError(authError.message);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [clearMessages]);

  const handleForgotPassword = useCallback(async () => {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    clearMessages();
    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: buildSiteUrl("/auth/callback?next=/auth/reset-password"),
      });
      if (resetError) {
        setError(resetError.message);
      } else {
        setSuccess("If that email is registered, you'll receive a reset link shortly.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [clearMessages, email]);

  return {
    view,
    email,
    password,
    error,
    success,
    busy,
    setEmail,
    setPassword,
    handleSwitchView,
    handleSubmit,
    handleGoogleSignIn,
    handleForgotPassword,
  };
}
