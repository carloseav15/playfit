import * as Sentry from "@sentry/nextjs";
import { getErrorMessage, jsonError } from "@/lib/api-errors";

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

function requestId(request: Request) {
  return (
    request.headers.get("x-vercel-id") ?? request.headers.get("x-request-id") ?? crypto.randomUUID()
  );
}

export async function withApiTiming(
  request: Request,
  route: string,
  handler: () => Promise<Response>,
) {
  const startedAt = performance.now();
  const id = requestId(request);

  try {
    const response = await handler();
    console.log(
      JSON.stringify({
        level: response.status >= 500 ? "error" : "info",
        msg: "api_response",
        route,
        method: request.method,
        requestId: id,
        statusCode: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    );
    return response;
  } catch (error) {
    captureApiError(error, {
      route,
      request,
      operation: "unhandled_route_error",
      statusCode: 500,
    });
    return jsonError("Internal server error", 500);
  }
}
