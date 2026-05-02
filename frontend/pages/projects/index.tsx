import Link from "next/link";
import { motion } from "framer-motion";
import { useIncubator } from "@/hooks/useIncubator";
import { useProjects } from "@/hooks/useProjects";
import { PipelineProgress } from "@/components/incubator/PipelineProgress";
import { categoryAccent, STAGE_LABEL } from "@/lib/incubator";

export default function ProjectsIndex() {
  const state = useIncubator();
  const { projects: apiProjects } = useProjects(state.projects);
  const projects = apiProjects.length > 0 ? apiProjects : state.projects;
  return (
    <div className="pt-6 sm:pt-12">
      <header className="text-center">
        <p className="text-[11px] uppercase tracking-wider2 text-honey-soft/55">
          Live builds
        </p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-light tracking-tight text-gradient-honey">
          Projects in flight
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-honey-soft/60">
          Each project moves from initiation to launch through the swarm. Tap a
          card to participate in its current stage.
        </p>
      </header>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
        }}
        className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        {projects.map((p) => (
          <motion.div
            key={p.id}
            variants={{
              hidden: { opacity: 0, y: 14 },
              show: { opacity: 1, y: 0, transition: { duration: 0.55 } },
            }}
          >
            <Link
              href={`/projects/${p.id}`}
              className="group block"
            >
              <div className="relative overflow-hidden glass-panel rounded-2xl p-6 hover:shadow-honey transition-all">
                <div
                  className={`pointer-events-none absolute -top-12 -right-12 h-44 w-44 rounded-full bg-gradient-to-br ${categoryAccent(
                    p.category,
                  )} blur-3xl opacity-40`}
                />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider2 text-honey-soft/55">
                      {p.category}
                    </span>
                    <span className="rounded-full bg-honey/10 px-2.5 py-0.5 text-[9px] uppercase tracking-wider2 text-honey-soft/75">
                      {STAGE_LABEL[p.currentStage]}
                    </span>
                  </div>
                  <h3 className="mt-3 text-2xl font-light text-honey-soft group-hover:text-honey-glow transition-colors">
                    {p.name}
                  </h3>
                  <p className="mt-2 text-sm text-honey-soft/60">{p.tagline}</p>

                  <div className="mt-6">
                    <PipelineProgress project={p} compact />
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-1 text-[11px] uppercase tracking-wider2 text-honey-soft/55 group-hover:text-honey-soft">
                    Enter project
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
