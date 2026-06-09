import { supabase } from "../data/supabase";
import { productStateSchema } from "../schemas";
import type { ProductState } from "../types";

const DB_VERSION = 2;

export const DEFAULT_PRODUCT_STATE: ProductState = {
  version: DB_VERSION,
  user: {
    onboarding: {
      step: "platforms",
      platforms: [],
      likedGameIds: [],
    },
    onboardingCompletedAt: null,
    profile: null,
    gameStates: {},
    lastUpdatedAt: null,
  },
};

export function createInitialState() {
  return JSON.parse(JSON.stringify(DEFAULT_PRODUCT_STATE)) as ProductState;
}

function getDeviceId(): string {
  let deviceId = localStorage.getItem("playfit_device_id");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("playfit_device_id", deviceId);
  }
  return deviceId;
}

let cachedToken: string | null = null;

export function setCachedToken(token: string | null) {
  cachedToken = token;
}

async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  cachedToken = session?.access_token ?? null;
  return cachedToken;
}

async function apiGet(path: string): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(path, { headers });
}

async function apiPost(path: string, body: unknown): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
}

async function apiDelete(path: string): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(path, { method: "DELETE", headers });
}

export async function loadProductState(): Promise<ProductState> {
  const deviceId = getDeviceId();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  const userId = user?.id ?? deviceId;

  const url = user ? "/api/profile" : `/api/profile?device_id=${encodeURIComponent(userId)}`;

  const res = await apiGet(url);

  if (!res.ok) {
    return createInitialState();
  }

  const json = await res.json();
  const data = json.state;

  if (!data) {
    return createInitialState();
  }

  const mapped: ProductState = {
    version: DB_VERSION,
    user: {
      onboarding: {
        step: data.onboarding?.step ?? "platforms",
        platforms: data.onboarding?.platforms ?? [],
        likedGameIds: data.onboarding?.likedGameIds ?? [],
      },
      onboardingCompletedAt: data.onboarding?.onboardingCompletedAt ?? null,
      profile: data.profile ?? null,
      gameStates: data.game_states ?? {},
      lastUpdatedAt: data.created_at ?? null,
    },
  };

  const parsed = productStateSchema.safeParse(mapped);
  return parsed.success ? parsed.data : mapped;
}

export type SaveStateResult =
  | { ok: true }
  | { ok: false; reason: "auth_expired" }
  | { ok: false; reason: "error"; error: string };

export async function saveProductState(state: ProductState): Promise<SaveStateResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let user = session?.user ?? null;

  cachedToken = session?.access_token ?? null;

  if (session?.user?.id) {
    const {
      data: { user: verifiedUser },
    } = await supabase.auth.getUser();
    user = verifiedUser;
    if (!verifiedUser) {
      cachedToken = null;
    }
  }

  const hadStaleSession = !!session?.user?.id && !user;

  if (hadStaleSession) {
    return { ok: false, reason: "auth_expired" };
  }

  const deviceId = getDeviceId();
  const userId = user?.id ?? deviceId;

  const body: Record<string, unknown> = {
    gameStates: state.user.gameStates,
    profile: state.user.profile,
    onboarding: {
      step: state.user.onboarding.step,
      platforms: state.user.onboarding.platforms,
      likedGameIds: state.user.onboarding.likedGameIds,
      onboardingCompletedAt: state.user.onboardingCompletedAt,
    },
  };

  if (!user) body.deviceId = userId;

  const res = await apiPost("/api/profile", body);

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return { ok: false, reason: "error", error: json.error ?? "Unknown error" };
  }

  return { ok: true };
}

export async function resetProductState() {
  const deviceId = getDeviceId();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  const userId = user?.id ?? deviceId;

  const url = user ? "/api/profile" : `/api/profile?device_id=${encodeURIComponent(userId)}`;

  await apiDelete(url);
}
