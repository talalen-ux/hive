import { motion } from "framer-motion";
import { STAGE_LABEL, STAGE_ORDER, type Project } from "@/lib/incubator";

type Props = {
  project: Project;
  compact?: boolean;
};

export function PipelineProgress({ project, compact }: Props) {
  return (
    <div className={`flex ${compact ? "gap-2" : "gap-3"} flex-wrap`}>
      {STAGE_ORDER.map((stage, i) => {
        const entry = project.stages.find((s) => s.stage === stage);
        const status = entry?.status ?? "PENDING";
        return (
          <div key={stage} className="flex items-center gap-2">
            <Hex status={status} index={i} compact={compact} />
            {!compact && (
              <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/55">
                {STAGE_LABEL[stage]}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Hex({
  status,
  index,
  compact,
}: {
  status: "DONE" | "ACTIVE" | "PENDING";
  index: number;
  compact?: boolean;
}) {
  const size = compact ? "h-5 w-5" : "h-7 w-7";
  return (
    <span className={`relative inline-block ${size}`}>
      {status === "DONE" && (
        <>
          <span className="hex-clip absolute inset-0 bg-gradient-to-br from-honey-glow via-honey to-honey-dark" />
          <span className="hex-clip absolute inset-[2px] bg-ink/80" />
          <svg
            viewBox="0 0 24 24"
            className="absolute inset-0 m-auto h-3 w-3 text-honey-glow"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </>
      )}
      {status === "ACTIVE" && (
        <>
          <span className="hex-clip absolute inset-0 bg-gradient-to-br from-honey-glow via-honey to-honey-dark" />
          <span className="hex-clip absolute inset-[2px] bg-ink/80" />
          <motion.span
            className="hex-clip absolute inset-[5px] bg-honey-glow/70"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity, delay: index * 0.1 }}
          />
        </>
      )}
      {status === "PENDING" && (
        <>
          <span className="hex-clip absolute inset-0 bg-honey/15" />
          <span className="hex-clip absolute inset-[2px] bg-ink/80" />
        </>
      )}
    </span>
  );
}
