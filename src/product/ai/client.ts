import {
  validateCheckinInterpretation,
  validateFinderInsight,
  validateProfileResponse,
} from "./contracts";
import type {
  CheckinInterpretation,
  FinderInsight,
  ProductInterviewAnswers,
  ProductProfile,
  ProductRuntimeMode,
  SeedGame,
} from "../types";

interface AiHealthResponse {
  configured: boolean;
  model: string;
  ok: boolean;
}

export type { AiHealthResponse };

async function postJson<T>(url: string, body: object, validator: (payload: unknown) => T) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return validator(payload);
}

export async function requestOnboardingProfile(params: {
  likedGames: SeedGame[];
  dislikedGames: SeedGame[];
  currentGame: SeedGame | null;
  answers: ProductInterviewAnswers;
}): Promise<ProductProfile> {
  return postJson("/api/ai/onboarding-profile", params, validateProfileResponse);
}

export async function requestFinderInsight(params: {
  game: SeedGame;
  profile: ProductProfile;
}): Promise<FinderInsight> {
  return postJson("/api/ai/finder-insight", params, validateFinderInsight);
}

export async function requestCheckinInterpretation(params: {
  note: string;
  currentSummary: string;
}): Promise<CheckinInterpretation> {
  return postJson("/api/ai/checkin-interpretation", params, validateCheckinInterpretation);
}

export async function detectProductRuntimeMode(): Promise<ProductRuntimeMode> {
  if (import.meta.env.VITE_ENABLE_AI !== "true") {
    return "local-only";
  }

  try {
    const response = await fetch("/api/ai/health", { method: "GET" });
    const payload = (await response.json().catch(() => null)) as AiHealthResponse | null;

    if (!response.ok || !payload?.configured) {
      return "local-only";
    }

    return "ai-assisted";
  } catch {
    return "local-only";
  }
}
