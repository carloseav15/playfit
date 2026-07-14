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

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId(): string {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "";
  }
  let deviceId = localStorage.getItem("playfit_device_id");
  if (!deviceId) {
    deviceId = generateUUID();
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

export function getCachedAuthToken(): string | null {
  return cachedToken;
}

function getUserId(): string | null {
  return cachedUserId;
}

export function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getCachedAuthToken();
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  let finalInput = input;
  if (!token && typeof window !== "undefined") {
    const deviceId = getDeviceId();
    if (deviceId) {
      if (typeof input === "string" && input.startsWith("/api/")) {
        try {
          const url = new URL(input, window.location.origin);
          if (!url.searchParams.has("device_id")) {
            url.searchParams.set("device_id", deviceId);
            finalInput = url.pathname + url.search;
          }
        } catch {
          // ignore
        }
      } else if (input instanceof URL && input.pathname.startsWith("/api/")) {
        if (!input.searchParams.has("device_id")) {
          input.searchParams.set("device_id", deviceId);
        }
      }
    }
  }

  return fetch(finalInput, { ...init, headers });
}

async function apiGet(path: string): Promise<Response> {
  return authenticatedFetch(path);
}

async function apiPost(path: string, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  return authenticatedFetch(path, { method: "POST", headers, body: JSON.stringify(body) });
}

async function apiDelete(path: string): Promise<Response> {
  return authenticatedFetch(path, { method: "DELETE" });
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
      lastUpdatedAt: data.updated_at ?? data.created_at ?? null,
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

export type ResetProductStateErrorReason = "auth_expired" | "server_error" | "network_error";

export class ResetProductStateError extends Error {
  readonly reason: ResetProductStateErrorReason;
  readonly status?: number;

  constructor(reason: ResetProductStateErrorReason, status?: number, message?: string) {
    super(message ?? `Failed to reset product state (${reason})`);
    this.name = "ResetProductStateError";
    this.reason = reason;
    this.status = status;
  }
}

export async function resetProductState(): Promise<void> {
  const deviceId = getDeviceId();
  const userId = getUserId() ?? deviceId;

  const url = getUserId() ? "/api/profile" : `/api/profile?device_id=${encodeURIComponent(userId)}`;

  let res: Response;
  try {
    res = await apiDelete(url);
  } catch {
    throw new ResetProductStateError("network_error");
  }

  if (res.ok) return;

  if (res.status === 401 || res.status === 403) {
    throw new ResetProductStateError("auth_expired", res.status);
  }
  throw new ResetProductStateError("server_error", res.status);
}
