import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ExplainerState = {
  metricId: string;
  discipline?: string;
  value?: number | null;
} | null;

type MetricExplainerContextType = {
  activeMetric: ExplainerState;
  openExplainer: (metricId: string, discipline?: string, value?: number | null) => void;
  closeExplainer: () => void;
};

const MetricExplainerCtx = createContext<MetricExplainerContextType | null>(null);

export function MetricExplainerProvider({ children }: { children: ReactNode }) {
  const [activeMetric, setActiveMetric] = useState<ExplainerState>(null);

  const openExplainer = useCallback((metricId: string, discipline?: string, value?: number | null) => {
    setActiveMetric({ metricId, discipline, value });
  }, []);

  const closeExplainer = useCallback(() => {
    setActiveMetric(null);
  }, []);

  return (
    <MetricExplainerCtx.Provider value={{ activeMetric, openExplainer, closeExplainer }}>
      {children}
    </MetricExplainerCtx.Provider>
  );
}

export function useExplainer() {
  const ctx = useContext(MetricExplainerCtx);
  if (!ctx) throw new Error("useExplainer must be used within MetricExplainerProvider");
  return ctx;
}
