export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
