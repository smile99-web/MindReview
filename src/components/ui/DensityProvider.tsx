'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  type DensityLevel,
  getDensityLevel,
  getInfoChunkSize,
  getExplanationLength,
  progressiveDisclosure,
} from '@/lib/ui-density';

interface DensityContextValue {
  /** Current UI density level. */
  densityLevel: DensityLevel;
  /** How many items to show at once. */
  infoChunkSize: number;
  /** Whether detailed content (examples, elaboration) should be shown. */
  shouldShowDetails: boolean;
  /** Current explanation verbosity. */
  explanationLength: 'brief' | 'normal' | 'detailed';
  /** Split content into visible/hidden parts for progressive disclosure. */
  progressiveDisclosure: (content: string) => { visible: string; hidden: string };
  /** Update the cognitive load level (1-5). */
  setCognitiveLoad: (load: number) => void;
}

const DensityContext = createContext<DensityContextValue>({
  densityLevel: 'comfortable',
  infoChunkSize: 5,
  shouldShowDetails: true,
  explanationLength: 'normal',
  progressiveDisclosure: (c: string) => ({ visible: c, hidden: '' }),
  setCognitiveLoad: () => {},
});

/**
 * Providers that wrap the density context use this name so consumers
 * can give a better error message when the context is missing.
 */
export const DENSITY_PROVIDER_NAME = 'DensityProvider';

/**
 * Hook to access UI density settings.
 *
 * Works without a provider — falls back to `'comfortable'` defaults.
 */
export function useDensity(): DensityContextValue {
  const ctx = useContext(DensityContext);
  return ctx;
}

interface DensityProviderProps {
  children: ReactNode;
  /** Optional initial load level (1-5). Defaults to 3 (comfortable). */
  initialLoad?: number;
}

export function DensityProvider({ children, initialLoad = 3 }: DensityProviderProps) {
  const [cognitiveLoad, setCognitiveLoadRaw] = useState(initialLoad);

  const setCognitiveLoad = useCallback((load: number) => {
    const clamped = Math.min(5, Math.max(1, Math.round(load)));
    setCognitiveLoadRaw(clamped);
  }, []);

  const value = useMemo<DensityContextValue>(() => {
    const densityLevel = getDensityLevel(cognitiveLoad);
    return {
      densityLevel,
      infoChunkSize: getInfoChunkSize(cognitiveLoad),
      shouldShowDetails: cognitiveLoad <= 3,
      explanationLength: getExplanationLength(cognitiveLoad),
      progressiveDisclosure: (content: string) =>
        progressiveDisclosure(content, cognitiveLoad),
      setCognitiveLoad,
    };
  }, [cognitiveLoad, setCognitiveLoad]);

  return (
    <DensityContext.Provider value={value}>
      {children}
    </DensityContext.Provider>
  );
}
