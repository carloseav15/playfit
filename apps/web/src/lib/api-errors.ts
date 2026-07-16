import type { z } from "zod";

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export function jsonData<TSchema extends z.ZodType>(schema: TSchema, payload: unknown) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "api_contract_error",
        issues: parsed.error.issues,
      }),
    );
    return jsonError("Invalid API response", 500);
  }

  return Response.json(parsed.data);
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
