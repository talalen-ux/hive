import { useRouter } from "next/router";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useIncubator } from "@/hooks/useIncubator";
import { useProject } from "@/hooks/useProjects";
import { projectKeyOf } from "@/hooks/useGovernor";
import { PipelineProgress } from "@/components/incubator/PipelineProgress";
import { TaskVote } from "@/components/incubator/TaskVote";
import { SubmitProposalForm } from "@/components/incubator/SubmitProposalForm";
import { SubmitTaskForm } from "@/components/incubator/SubmitTaskForm";
import { CommunityProposalRow } from "@/components/incubator/CommunityProposalRow";
import {
  STAGE_ORDER,
  categoryAccent,
  type Project,
} from "@/lib/incubator";

export default function ProjectDetail() {
  const router = useRouter();
  const { id } = router.query;
  const state = useIncubator();
  const seed = useMemo(
    () => state.projects.find((p) => p.id === id),
    [state.projects, id],
  );
  const { project: apiProject } = useProject(typeof id === "string" ? id : undefined, seed);
  const project = apiProject ?? seed;

  const projectTasks = useMemo(() => {
    if (typeof id !== "string") return [];
    const onchainKey = projectKeyOf(id).toLowerCase();
    return state.tasks.filter(
      (t) => t.projectId === id || t.projectId.toLowerCase() === onchainKey,
    );
  }, [state.tasks, id]);

  // Open votes: ACTIVE A/B/C tasks. Promoted-from-proposal tasks have empty
  // option arrays and live in the proposals section instead.
  const openTasks = useMemo(
    () => projectTasks.filter((t) => t.status === "ACTIVE" && t.options.length > 0),
    [projectTasks],
  );

  // Community proposals for this project, sorted with active windows first.
  // On-chain proposals carry projectKey = keccak256(FE-id); mock entries
  // store the FE id directly. Match either form.
  const communityProposals = useMemo(() => {
    if (typeof id !== "string") return [];
    const onchainKey = projectKeyOf(id).toLowerCase();
    const rows = state.communityProposals.filter(
      (p) => p.projectId === id || p.projectId.toLowerCase() === onchainKey,
    );
    return rows.slice().sort((a, b) => {
      if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
      if (b.status === "ACTIVE" && a.status !== "ACTIVE") return 1;
      if (a.status === "ACTIVE") return a.votingEnd - b.votingEnd;
      return b.submittedAt - a.submittedAt;
    });
  }, [state.communityProposals, id]);

  if (!project) {
    return (
      <div className="pt-12 text-center">
        <h1 className="text-2xl font-light text-honey-soft">Project not found</h1>
        <Link
          href="/projects"
          className="mt-4 inline-block text-[11px] uppercase tracking-wider2 text-honey-soft/65 hover:text-honey-soft"
        >
          ← back to projects
        </Link>
      </div>
    );
  }

  const stageProgress = stageProgressOf(project);
  const activeProposalCount = communityProposals.filter((p) => p.status === "ACTIVE").length;

  return (
    <div className="pt-6 sm:pt-12">
      <Link
        href="/projects"
        className="text-[11px] uppercase tracking-wider2 text-honey-soft/55 hover:text-honey-soft"
      >
        ← all projects
      </Link>

      <header className="relative mt-4 overflow-hidden glass-panel rounded-2xl p-8">
        <div
          className={`pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-gradient-to-br ${categoryAccent(
            project.category,
          )} blur-3xl opacity-50`}
        />
        <div className="relative">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider2 text-honey-soft/55">
            <span>{project.category}</span>
            <span>·</span>
            <span>Stage {currentStageIndex(project) + 1} of {STAGE_ORDER.length}</span>
          </div>
          <h1 className="mt-3 text-4xl sm:text-5xl font-light text-honey-soft">
            {project.name}
          </h1>
          <p className="mt-2 max-w-xl text-honey-soft/65">{project.tagline}</p>

          <div className="mt-6">
            <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wider2 text-honey-soft/50">
              <span>Pipeline progress</span>
              <span className="numeric">{(stageProgress * 100).toFixed(0)}%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-honey/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-honey-dark via-honey to-honey-glow"
                initial={{ width: 0 }}
                animate={{ width: `${stageProgress * 100}%` }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </header>

      <section className="mt-10">
        <h2 className="text-[10px] uppercase tracking-wider2 text-honey-soft/50">
          Stages
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-y-3">
          <PipelineProgress project={project} />
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-xl font-light text-honey-soft">
              Community proposals
            </h2>
            <p className="mt-1 text-[12px] text-honey-soft/45">
              Stakers submit · holders vote · 60% YES + quorum to pass · winners become tasks
            </p>
          </div>
          <span className="rounded-full bg-honey/10 px-3 py-1 text-[10px] uppercase tracking-wider2 text-honey-soft/75">
            {activeProposalCount} open
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
          <SubmitProposalForm projectId={project.id} />

          {communityProposals.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-sm text-honey-soft/60">
              No proposals yet for this project. Be the first.
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
              }}
              className="space-y-4"
            >
              {communityProposals.map((p) => (
                <motion.div
                  key={p.id}
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
                  }}
                >
                  <CommunityProposalRow proposal={p} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-xl font-light text-honey-soft">
              Multi-option votes
            </h2>
            <p className="mt-1 text-[12px] text-honey-soft/45">
              Naming, designs, A/B/C decisions · stakers submit · 55% leader to pass
            </p>
          </div>
          <span className="rounded-full bg-honey/10 px-3 py-1 text-[10px] uppercase tracking-wider2 text-honey-soft/75">
            {openTasks.length} active
          </span>
        </div>

        <div className="mt-6">
          <SubmitTaskForm projectId={project.id} />
        </div>

        {openTasks.length === 0 ? (
          <div className="mt-6 glass-panel rounded-2xl p-8 text-center text-sm text-honey-soft/60">
            No open task votes — current stage is between motions.
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
            }}
            className="mt-6 space-y-4"
          >
            {openTasks.map((t) => (
              <motion.div
                key={t.id}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
                }}
              >
                <TaskVote task={t} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>
    </div>
  );
}

function currentStageIndex(project: Project): number {
  const i = STAGE_ORDER.indexOf(project.currentStage);
  return i < 0 ? 0 : i;
}

function stageProgressOf(project: Project): number {
  const done = project.stages.filter((s) => s.status === "DONE").length;
  const active = project.stages.find((s) => s.status === "ACTIVE") ? 0.5 : 0;
  return Math.min(1, (done + active) / STAGE_ORDER.length);
}
