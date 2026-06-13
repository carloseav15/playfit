import { productStateSchema } from "../schemas";
import type { ProductGameState, ProductState } from "../types";

const DB_VERSION = 2;

export const DEFAULT_PRODUCT_STATE: ProductState = {
  version: DB_VERSION,
  user: {
    onboarding: {
      step: "platforms",
      platforms: [],
      likedGameIds: [],
      dislikedGameIds: [],
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
let cachedUserId: string | null = null;

export function setCachedAuth(token: string | null, userId: string | null = null) {
  cachedToken = token;
  cachedUserId = userId;
}

function getToken(): string | null {
  return cachedToken;
}

function getUserId(): string | null {
  return cachedUserId;
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

async function apiPatch(path: string, body: unknown): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(path, { method: "PATCH", headers, body: JSON.stringify(body) });
}

async function apiDelete(path: string): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(path, { method: "DELETE", headers });
}

export async function loadProductState(): Promise<ProductState> {
  const deviceId = getDeviceId();

  const url = `/api/profile?device_id=${encodeURIComponent(deviceId)}`;

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
        dislikedGameIds: data.onboarding?.dislikedGameIds ?? [],
      },
      onboardingCompletedAt: data.onboarding?.onboardingCompletedAt ?? null,
      profile: data.profile ?? null,
      gameStates: data.game_states ?? {},
      lastUpdatedAt: data.created_at ?? null,
    },
  };

  const parsed = productStateSchema.safeParse(mapped);
  return parsed.success ? parsed.data : createInitialState();
}

export type SaveStateResult =
  | { ok: true }
  | { ok: false; reason: "auth_expired" }
  | { ok: false; reason: "error"; error: string };

export async function saveProductState(state: ProductState): Promise<SaveStateResult> {
  const parsedState = productStateSchema.safeParse(state);
  if (!parsedState.success) {
    return { ok: false, reason: "error", error: "Invalid local profile state" };
  }

  const safeState = parsedState.data;
  const deviceId = getDeviceId();

  const body: Record<string, unknown> = {
    gameStates: safeState.user.gameStates,
    profile: safeState.user.profile,
    onboarding: {
      step: safeState.user.onboarding.step,
      platforms: safeState.user.onboarding.platforms,
      likedGameIds: safeState.user.onboarding.likedGameIds,
      dislikedGameIds: safeState.user.onboarding.dislikedGameIds,
      onboardingCompletedAt: safeState.user.onboardingCompletedAt,
    },
    deviceId,
  };

  const res = await apiPost("/api/profile", body);

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return { ok: false, reason: "error", error: json.error ?? "Unknown error" };
  }

  return { ok: true };
}

export async function resetProductState() {
  const deviceId = getDeviceId();
  const userId = getUserId() ?? deviceId;

  const url = getUserId() ? "/api/profile" : `/api/profile?device_id=${encodeURIComponent(userId)}`;

  await apiDelete(url);
}

export type SaveGameStateResult = { ok: true } | { ok: false; reason: "error"; error: string };

export async function saveGameState(
  gameId: string,
  gameState: Partial<ProductGameState>,
): Promise<SaveGameStateResult> {
  const body: Record<string, unknown> = {
    status: gameState.status ?? null,
    rating: gameState.rating ?? null,
    inBacklog: gameState.inBacklog ?? null,
    inWishlist: gameState.inWishlist ?? null,
    excluded: gameState.excluded ?? null,
    source: gameState.source ?? "manual",
  };

  const res = await apiPatch(`/api/profile/games/${encodeURIComponent(gameId)}`, body);

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return { ok: false, reason: "error", error: json.error ?? "Unknown error" };
  }

  return { ok: true };
}

export async function deleteGameState(gameId: string): Promise<SaveGameStateResult> {
  const res = await apiDelete(`/api/profile/games/${encodeURIComponent(gameId)}`);

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return { ok: false, reason: "error", error: json.error ?? "Unknown error" };
  }

  return { ok: true };
}
