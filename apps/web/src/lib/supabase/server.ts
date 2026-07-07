import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-dev-anon-key",
    {
      db: { schema: "games_library" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}

export function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-dev-anon-key",
    {
      db: { schema: "games_library" },
      auth: { persistSession: false },
    },
  );
}

export type RequestSupabaseContext = {
  client: ReturnType<typeof createAnonClient>;
  userId: string;
};

function createAuthenticatedDataClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-dev-anon-key",
    {
      db: { schema: "games_library" },
      auth: { persistSession: false },
      accessToken: async () => accessToken,
    },
  );
}

export async function createRequestSupabaseContext(
  request: Request,
): Promise<RequestSupabaseContext | null> {
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (accessToken) {
    try {
      const validationClient = createAnonClient();
      const {
        data: { user },
        error,
      } = await validationClient.auth.getUser(accessToken);
      if (error || !user?.id) return null;

      return {
        client: createAuthenticatedDataClient(accessToken),
        userId: user.id,
      };
    } catch {
      return null;
    }
  }

  try {
    const client = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user?.id) return null;

    return { client, userId: user.id };
  } catch {
    return null;
  }
}

export function createServiceRoleClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_KEY is not set");

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    serviceKey,
    {
      db: { schema: "games_library" },
      auth: { persistSession: false },
    },
  );
}
