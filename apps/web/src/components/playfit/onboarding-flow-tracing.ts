const FLOW_ID_STORAGE_KEY = "playfit_onboarding_flow_id";

type PhaseDetails = Record<string, boolean | number | string | undefined>;

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function generateFlowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `onboarding-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOnboardingFlowId(): string | null {
  try {
    return getSessionStorage()?.getItem(FLOW_ID_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function beginOnboardingFlow(): string {
  const flowId = generateFlowId();
  try {
    getSessionStorage()?.setItem(FLOW_ID_STORAGE_KEY, flowId);
  } catch {
    // Tracing must remain best-effort when storage is unavailable or restricted.
  }
  markOnboardingPhase("finalize_start");
  return flowId;
}

export function markOnboardingPhase(phase: string, details: PhaseDetails = {}) {
  const flowId = getOnboardingFlowId();
  if (!flowId || typeof performance === "undefined") return;

  const markName = `playfit-onboarding:${phase}`;
  performance.mark(markName, {
    detail: { flowId, ...details },
  });
}

export function getOnboardingFlowHeaders(phase: string): Record<string, string> {
  const flowId = getOnboardingFlowId();
  if (!flowId) return {};

  return {
    "x-playfit-flow-id": flowId,
    "x-playfit-flow-phase": phase,
  };
}
