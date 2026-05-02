import { useEffect, useState } from "react";
import type { Project } from "@/lib/incubator";

type State = { projects: Project[]; loading: boolean; error?: string };

/**
 * Loads project metadata from /api/projects. Used by the projects index +
 * detail pages. Falls back to the seed list shipped with the build via the
 * mock store when the network request fails so the UI never goes blank.
 */
export function useProjects(initial: Project[] = []) {
  const [state, setState] = useState<State>({ projects: initial, loading: true });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`http ${r.status}`))))
      .then((d: { projects: Project[] }) => {
        setState({ projects: hydrate(d.projects), loading: false });
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setState((s) => ({ ...s, loading: false, error: e.message }));
      });
    return () => controller.abort();
  }, []);

  return state;
}

export function useProject(key: string | undefined, initial?: Project) {
  const [state, setState] = useState<{ project?: Project; loading: boolean; error?: string }>({
    project: initial,
    loading: !!key,
  });

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`/api/projects/${encodeURIComponent(key)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`http ${r.status}`))))
      .then((d: { project: Project }) => {
        setState({ project: hydrateOne(d.project), loading: false });
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setState((s) => ({ ...s, loading: false, error: e.message }));
      });
    return () => controller.abort();
  }, [key]);

  return state;
}

function hydrate(arr: Project[]): Project[] {
  return arr.map(hydrateOne);
}

function hydrateOne(p: Project): Project {
  return {
    ...p,
    stages: p.stages.map((s) => ({
      ...s,
      completedAt: s.completedAt ?? undefined,
    })),
  };
}
