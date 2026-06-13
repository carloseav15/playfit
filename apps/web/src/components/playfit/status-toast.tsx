"use client";

import { Toast } from "@/components/ui/toast";
import { usePlayfit } from "./playfit-context";

export function StatusToast() {
  const { ui, setUi, retrySave } = usePlayfit();
  const isSaveError = ui.saveStatus === "error";

  return (
    <Toast
      open={!!ui.statusMessage}
      message={ui.statusMessage ?? ""}
      variant={isSaveError ? "error" : "default"}
      onRetry={isSaveError ? retrySave : undefined}
      onDismiss={() => setUi((current) => ({ ...current, statusMessage: null }))}
    />
  );
}
