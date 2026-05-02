import { motion } from "framer-motion";
import type { Idea } from "@/lib/incubator";
import { categoryAccent } from "@/lib/incubator";

type Props = {
  idea: Idea;
  onApprove: () => void;
  onReject: () => void;
  z?: number;
};

export function IdeaCard({ idea, onApprove, onReject, z = 1 }: Props) {
  const opportunity = Math.round(
    (idea.marketPotential * 0.7 + (10 - idea.complexity) * 0.3) * 10,
  );

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={(_, info) => {
        if (info.offset.x > 140) onApprove();
        else if (info.offset.x < -140) onReject();
      }}
      whileDrag={{ scale: 1.02 }}
      style={{ zIndex: z }}
      className="relative w-full cursor-grab active:cursor-grabbing"
    >
      <div className="glass-panel relative overflow-hidden rounded-2xl p-7 shadow-honey">
        <div
          className={`pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-gradient-to-br ${categoryAccent(
            idea.category,
          )} blur-3xl opacity-50`}
        />

        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider2 text-honey-soft/55">
              {idea.category} · {idea.buildTime}
            </span>
            <ScoreChip label="opp" value={opportunity} />
          </div>

          <h3 className="mt-4 text-3xl font-light text-honey-soft">
            {idea.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-honey-soft/70">
            {idea.description}
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <Metric label="Complexity" value={idea.complexity} />
            <Metric label="Market" value={idea.marketPotential} />
            <Metric label="Build" value={idea.buildTime} small />
          </div>

          <div className="mt-7 flex items-center gap-3">
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={onReject}
              className="flex-1 rounded-full border border-honey/15 px-5 py-2.5 text-[12px] tracking-wider2 uppercase text-honey-soft/65 hover:border-honey/35 hover:text-honey-soft transition-all"
            >
              Pass
            </motion.button>
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={onApprove}
              className="flex-1 rounded-full bg-gradient-to-br from-honey-soft to-honey px-5 py-2.5 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all"
            >
              Send to swarm
            </motion.button>
          </div>

          <p className="mt-4 text-center text-[10px] uppercase tracking-wider2 text-honey-soft/30">
            Drag → approve · Drag ← reject
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function Metric({
  label,
  value,
  small,
}: {
  label: string;
  value: number | string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-honey/10 bg-ink/40 px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider2 text-honey-soft/50">
        {label}
      </div>
      <div
        className={`mt-1 ${
          small ? "text-sm" : "text-xl"
        } font-light text-honey-soft numeric`}
      >
        {value}
        {typeof value === "number" && <span className="ml-1 text-[10px] text-honey-soft/35">/10</span>}
      </div>
    </div>
  );
}

function ScoreChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-honey/25 bg-honey/[0.05] px-3 py-1">
      <span className="text-[9px] uppercase tracking-wider2 text-honey-soft/60">
        {label}
      </span>
      <span className="text-xs font-medium text-honey-soft numeric">{value}</span>
    </div>
  );
}
