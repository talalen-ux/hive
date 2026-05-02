import projectsJson from "@/data/projects.json";
import type { Project, ProjectStage } from "@/lib/incubator";

type RawProject = (typeof projectsJson)["projects"][number];

/**
 * Loads project metadata from the JSON catalogue. The shape returned matches
 * the same `Project` type the mock store + on-chain governor adapt to, so
 * downstream consumers stay agnostic.
 */
export function loadProjects(): Project[] {
  return projectsJson.projects.map(decode);
}

export function loadProject(key: string): Project | undefined {
  const p = projectsJson.projects.find((x) => x.key === key);
  return p ? decode(p) : undefined;
}

function decode(p: RawProject): Project {
  return {
    id: p.key,
    name: p.name,
    ideaId: `seed-${p.key}`,
    tagline: p.tagline,
    category: p.category as Project["category"],
    currentStage: p.currentStage as ProjectStage,
    stages: p.stages.map((s) => ({
      stage: s.stage as ProjectStage,
      status: s.status as "DONE" | "ACTIVE" | "PENDING",
      completedAt:
        "completedAtIso" in s && s.completedAtIso
          ? new Date(s.completedAtIso).getTime()
          : undefined,
    })),
    startedAt: new Date(p.startedAtIso).getTime(),
  };
}
