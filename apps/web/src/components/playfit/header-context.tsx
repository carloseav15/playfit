"use client";

import type * as React from "react";
import { createContext, useContext, useEffect, useState } from "react";

export interface HeaderConfig {
  title?: string;
  onBack?: (() => void) | null;
}

interface HeaderContextValue {
  config: HeaderConfig;
  setConfig: React.Dispatch<React.SetStateAction<HeaderConfig>>;
}

const HeaderContext = createContext<HeaderContextValue | null>(null);

export function HeaderProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<HeaderConfig>({});

  return <HeaderContext.Provider value={{ config, setConfig }}>{children}</HeaderContext.Provider>;
}

export function useHeaderContext() {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error("useHeaderContext must be used within a HeaderProvider");
  }
  return context;
}

export function useHeader(config: HeaderConfig, deps: React.DependencyList = []) {
  const { setConfig } = useHeaderContext();

  useEffect(() => {
    setConfig(config);
    return () => {
      setConfig({});
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: custom hook dependency forwarding
  }, deps);
}
