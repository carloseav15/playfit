"use client";

import { ArrowRight, Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField, FormLabel } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { supabase } from "@/lib/supabase/client";

type SessionCheck = "checking" | "valid" | "invalid";

export default function ResetPasswordPage() {
  const [sessionCheck, setSessionCheck] = useState<SessionCheck>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSessionCheck(data.session ? "valid" : "invalid");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
      } else {
        setDone(true);
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-6 text-center bg-background text-foreground">
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[400px] rounded-full bg-accent/10 blur-[110px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/3 size-[350px] rounded-full bg-indigo-500/10 blur-[100px]" />

      <motion.div
        layout
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="relative grid w-full max-w-sm gap-6 rounded-3xl border border-white/10 bg-gradient-to-br from-card/65 via-card/55 to-background/35 p-6 sm:p-8 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_50px_rgba(255,106,61,0.04)] overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="flex flex-col items-center text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent font-mono">
            Playfit Decisions
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
            Reset Password
          </h1>
        </div>

        {sessionCheck === "checking" && (
          <div className="grid place-items-center py-6">
            <Spinner size="lg" />
          </div>
        )}

        {sessionCheck === "invalid" && (
          <div className="grid gap-4 text-left">
            <Alert
              variant="error"
              className="py-2.5 px-3.5 text-xs rounded-xl border border-destructive/20 bg-destructive/5"
            >
              This reset link is invalid or has expired. Request a new one from the sign-in screen.
            </Alert>
            <Button asChild className="w-full h-11 rounded-xl font-extrabold text-sm">
              <Link href="/">Back to Playfit</Link>
            </Button>
          </div>
        )}

        {sessionCheck === "valid" && !done && (
          <form onSubmit={handleSubmit} className="grid gap-4 text-left">
            <div className="grid gap-3.5">
              <FormField>
                <FormLabel
                  htmlFor="reset-password"
                  className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/90 mb-1 flex items-center gap-1.5"
                >
                  <Lock className="size-3.5 text-accent" />
                  New Password
                </FormLabel>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  className="border-white/10 bg-secondary/20 rounded-xl h-11 px-3.5 text-base md:text-sm"
                />
              </FormField>

              <FormField>
                <FormLabel
                  htmlFor="reset-password-confirm"
                  className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/90 mb-1 flex items-center gap-1.5"
                >
                  <Lock className="size-3.5 text-accent" />
                  Confirm Password
                </FormLabel>
                <Input
                  id="reset-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Re-enter your new password"
                  className="border-white/10 bg-secondary/20 rounded-xl h-11 px-3.5 text-base md:text-sm"
                />
              </FormField>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  key="reset-password-error"
                >
                  <Alert
                    variant="error"
                    className="py-2.5 px-3.5 text-xs rounded-xl border border-destructive/20 bg-destructive/5"
                  >
                    {error}
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={busy}
              loading={busy}
              className="w-full mt-1.5 h-11 rounded-xl bg-accent text-white font-extrabold text-sm hover:bg-accent/90"
            >
              {busy ? (
                "Updating…"
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  Update Password
                  <ArrowRight className="size-4 shrink-0" />
                </span>
              )}
            </Button>
          </form>
        )}

        {done && (
          <div className="grid gap-4 text-left">
            <Alert
              variant="success"
              className="py-2.5 px-3.5 text-xs rounded-xl border border-positive/20 bg-positive/5"
            >
              Your password has been updated.
            </Alert>
            <Button asChild className="w-full h-11 rounded-xl font-extrabold text-sm">
              <Link href="/">Continue to Playfit</Link>
            </Button>
          </div>
        )}
      </motion.div>
    </main>
  );
}
