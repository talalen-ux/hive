import { useEffect, useSyncExternalStore } from "react";
import { ensureHydrated, getState, subscribe } from "@/lib/incubator";

export function useIncubator() {
  // hydrate once on the client
  useEffect(() => {
    ensureHydrated();
  }, []);
  return useSyncExternalStore(subscribe, getState, getState);
}

/** Re-render every `intervalMs` so countdowns refresh smoothly. */
export function useTick(intervalMs = 1000) {
  // returns a number that ticks up each interval. components destructure it
  // as a dependency for derived state.
  const subscribe_ = (cb: () => void) => {
    const id = setInterval(cb, intervalMs);
    return () => clearInterval(id);
  };
  return useSyncExternalStore(
    subscribe_,
    () => Date.now(),
    () => 0,
  );
}
