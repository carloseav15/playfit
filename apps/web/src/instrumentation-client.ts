import * as Sentry from "@sentry/nextjs";

const environment = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  tracePropagationTargets: ["localhost", /^https:\/\/playfit-gold\.vercel\.app/, /^\//],
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications.",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
