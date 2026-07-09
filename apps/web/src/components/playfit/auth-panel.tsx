"use client";

import { ArrowLeft, ArrowRight, Lock, Mail, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import type React from "react";
import { useCallback, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField, FormLabel } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { buildSiteUrl } from "@/lib/site-url";
import { supabase } from "@/lib/supabase/client";

interface AuthPanelProps {
  onAuth: (userId: string, email: string) => void;
  onContinueLocal: () => void;
}

type AuthView = "options" | "signin" | "signup";

export function AuthPanel({ onAuth, onContinueLocal }: AuthPanelProps) {
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
      setError(null);
      setSuccess(null);
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
    [email, password, view, onAuth],
  );

  const handleGoogleSignIn = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildSiteUrl("/auth/callback"),
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

  const handleForgotPassword = useCallback(async () => {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    setError(null);
    setSuccess(null);
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
  }, [email]);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-6 text-center bg-background text-foreground animate-in fade-in duration-300">
      {/* Premium Background Ambient Glows */}
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[400px] rounded-full bg-accent/10 blur-[110px] animate-pulse-slow" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/3 size-[350px] rounded-full bg-indigo-500/10 blur-[100px] animate-pulse-slower" />
      <div className="pointer-events-none absolute left-1/3 bottom-1/4 size-[250px] rounded-full bg-pink-500/5 blur-[80px] animate-pulse-slow" />

      <motion.div
        layout
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="relative grid w-full max-w-sm gap-6 rounded-3xl border border-white/10 bg-gradient-to-br from-card/65 via-card/55 to-background/35 p-6 sm:p-8 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_50px_rgba(255,106,61,0.04)] overflow-hidden"
      >
        {/* Soft top border line for premium glass effect */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Header Navigation Bar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-50">
          {view !== "options" ? (
            <button
              type="button"
              onClick={() => handleSwitchView("options")}
              className="size-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Back"
            >
              <ArrowLeft className="size-4" />
            </button>
          ) : (
            <div className="size-8" />
          )}

          <button
            type="button"
            onClick={onContinueLocal}
            className="size-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Branding & Logo */}
        <div className="flex flex-col items-center text-center mt-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="relative size-14 rounded-2xl overflow-hidden shadow-lg border border-white/10 bg-secondary/20 p-2 mb-3.5 animate-float-slow"
          >
            <Image
              src="/playfit_logo_light.png"
              alt="Playfit Brand Logo"
              fill
              sizes="56px"
              className="object-cover dark:hidden p-2"
              priority
            />
            <Image
              src="/playfit_logo_dark.png"
              alt="Playfit Brand Logo"
              fill
              sizes="56px"
              className="hidden object-cover dark:block p-2"
              priority
            />
          </motion.div>

          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent font-mono">
            Playfit Decisions
          </p>

          <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
            {view === "signin"
              ? "Sign In"
              : view === "signup"
                ? "Create Account"
                : "Welcome to Playfit"}
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-[280px]">
            {view === "signin"
              ? "Enter your email credentials to access your library."
              : view === "signup"
                ? "Create an account to backup recommendations in the cloud."
                : "Choose how you want to sync your library across devices."}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {view === "options" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              key="auth-options-view"
              className="grid gap-3"
            >
              {/* Google OAuth Button */}
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={busy}
                loading={busy}
                className="w-full h-12 rounded-xl gap-2.5 hover:bg-secondary/40 border-white/10 bg-secondary/10 font-black text-xs active:scale-[0.98] transition-all"
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
                Continue with Google
              </Button>

              {/* Email Credentials Trigger */}
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSwitchView("signin")}
                className="w-full h-12 rounded-xl gap-2.5 hover:bg-secondary/40 border-white/10 bg-secondary/15 font-black text-xs active:scale-[0.98] transition-all"
              >
                <Mail className="size-4 text-accent" />
                Continue with Email
              </Button>

              {/* Guest Trigger */}
              <Button
                type="button"
                variant="secondary"
                onClick={onContinueLocal}
                className="w-full h-12 rounded-xl font-extrabold text-xs bg-secondary/30 border border-border/20 hover:bg-secondary active:scale-[0.98]"
              >
                Continue as Guest
              </Button>

              <div className="flex justify-center mt-2">
                <button
                  type="button"
                  onClick={() => handleSwitchView("signup")}
                  className="text-xs font-semibold text-muted-foreground/80 hover:text-foreground underline transition-colors cursor-pointer"
                >
                  New to Playfit? Create account
                </button>
              </div>
            </motion.div>
          )}

          {(view === "signin" || view === "signup") && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              key="auth-email-view"
            >
              <form onSubmit={handleSubmit} className="grid gap-4 text-left">
                <div className="grid gap-3.5">
                  <FormField>
                    <FormLabel
                      htmlFor="auth-email"
                      className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/90 mb-1 flex items-center gap-1.5"
                    >
                      <Mail className="size-3.5 text-accent" />
                      Email Address
                    </FormLabel>
                    <Input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className="border-white/10 bg-secondary/20 rounded-xl h-11 px-3.5 text-base md:text-sm transition-all duration-300 focus:bg-background focus:ring-2 focus:ring-accent/40 focus:border-accent"
                    />
                  </FormField>

                  <FormField>
                    <FormLabel
                      htmlFor="auth-password"
                      className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/90 mb-1 flex items-center gap-1.5"
                    >
                      <Lock className="size-3.5 text-accent" />
                      Password
                    </FormLabel>
                    <Input
                      id="auth-password"
                      type="password"
                      autoComplete={view === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="At least 6 characters"
                      className="border-white/10 bg-secondary/20 rounded-xl h-11 px-3.5 text-base md:text-sm transition-all duration-300 focus:bg-background focus:ring-2 focus:ring-accent/40 focus:border-accent"
                    />
                  </FormField>
                </div>

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      key="auth-error-alert"
                    >
                      <Alert
                        variant="error"
                        className="py-2.5 px-3.5 text-xs rounded-xl border border-destructive/20 bg-destructive/5"
                      >
                        {error}
                      </Alert>
                    </motion.div>
                  )}
                  {success && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      key="auth-success-alert"
                    >
                      <Alert
                        variant="success"
                        className="py-2.5 px-3.5 text-xs rounded-xl border border-positive/20 bg-positive/5"
                      >
                        {success}
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button
                  type="submit"
                  disabled={busy}
                  loading={busy}
                  className="w-full mt-1.5 h-11 rounded-xl bg-accent text-white font-extrabold text-sm hover:bg-accent/90 active:scale-[0.98] transition-all duration-200 shadow-md shadow-accent/10 hover:shadow-accent/20 dark:shadow-[0_0_15px_rgba(255,106,61,0.15)]"
                >
                  {busy ? (
                    view === "signup" ? (
                      "Creating account…"
                    ) : (
                      "Signing in…"
                    )
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      {view === "signup" ? "Create Account" : "Sign In"}
                      <ArrowRight className="size-4 shrink-0" />
                    </span>
                  )}
                </Button>

                {view === "signin" && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-muted-foreground underline transition-colors hover:text-foreground text-center mt-1 cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </form>

              <div className="flex justify-center mt-4">
                <button
                  type="button"
                  onClick={() => handleSwitchView(view === "signin" ? "signup" : "signin")}
                  className="text-xs font-semibold text-muted-foreground/90 transition-colors hover:text-foreground cursor-pointer"
                >
                  {view === "signin"
                    ? "No account yet? Create one"
                    : "Already have an account? Sign in"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {view === "options" && (
          <div className="grid gap-2 border-t border-white/5 pt-4 text-center px-1">
            <p className="text-[10px] leading-relaxed text-muted-foreground/80">
              Guest profiles store choices locally in your browser cache. Creating an account allows
              you to backup and sync recommendations.
            </p>
          </div>
        )}
      </motion.div>
    </main>
  );
}
