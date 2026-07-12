import { cookies } from "next/headers";

export const RETURNING_VISITOR_COOKIE = "pf_returning";

export async function isReturningVisitor() {
  const cookieStore = await cookies();
  return cookieStore.get(RETURNING_VISITOR_COOKIE)?.value === "1";
}
