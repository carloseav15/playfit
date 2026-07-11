import * as Sentry from "@sentry/nextjs";
import { getErrorMessage } from "@/lib/api-errors";

interface CaptureApiErrorOptions {
  route: string;
  request?: Request;
  operation?: string;
  statusCode?: number;
}

export function captureApiError(error: unknown, options: CaptureApiErrorOptions) {
  const message = getErrorMessage(error, "Unknown error");
  const requestId = options.request?.headers.get("x-vercel-id") ?? undefined;

  console.error(
    JSON.stringify({
      level: "error",
      msg: "api_error",
      route: options.route,
      method: options.request?.method,
      operation: options.operation,
      statusCode: options.statusCode,
      requestId,
      error: message,
    }),
  );

  Sentry.captureException(error, {
    tags: {
      route: options.route,
      method: options.request?.method ?? "unknown",
      operation: options.operation ?? "unknown",
      status_code: String(options.statusCode ?? 500),
    },
    extra: {
      requestId,
    },
  });
}
