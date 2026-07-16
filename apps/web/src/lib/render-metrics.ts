import type { ProfilerOnRenderCallback } from "react";

export const profileRendersEnabled =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PROFILE_RENDERS === "1";

export const reportRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration) => {
  if (!profileRendersEnabled) return;

  console.info(
    JSON.stringify({
      msg: "react_render",
      component: id,
      phase,
      actualDurationMs: Math.round(actualDuration * 100) / 100,
      baseDurationMs: Math.round(baseDuration * 100) / 100,
    }),
  );
};
