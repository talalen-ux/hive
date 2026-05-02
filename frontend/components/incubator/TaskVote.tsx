import { motion } from "framer-motion";
import { fmtNum, voteOnTask, type Task } from "@/lib/incubator";
import { useIncubator } from "@/hooks/useIncubator";
import { Countdown } from "./Countdown";

export function TaskVote({ task }: { task: Task }) {
  const state = useIncubator();
  const myChoice = state.myVotes[`task:${task.id}`];
  const total = task.options.reduce((s, o) => s + o.votes, 0);

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/50">
            Task vote · {task.stage.replace(/_/g, " ").toLowerCase()}
          </div>
          <h3 className="mt-1 text-lg font-light text-honey-soft">
            {task.description}
          </h3>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/50">
            Closes in
          </div>
          <div className="text-honey-soft numeric">
            <Countdown end={task.votingEnd} />
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {task.options.map((opt) => {
          const pct = total > 0 ? opt.votes / total : 0;
          const active = myChoice === opt.id;
          const leader =
            task.options.reduce((a, b) => (a.votes >= b.votes ? a : b)).id ===
            opt.id;
          return (
            <motion.button
              key={opt.id}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.99 }}
              disabled={!!myChoice}
              onClick={() => voteOnTask(task.id, opt.id)}
              className={`relative w-full overflow-hidden rounded-xl border px-5 py-4 text-left transition-all ${
                active
                  ? "border-honey/55 bg-honey/[0.06] shadow-honey"
                  : myChoice
                  ? "border-honey/10 bg-honey/[0.02] opacity-70"
                  : "border-honey/15 bg-honey/[0.02] hover:border-honey/35"
              }`}
            >
              {/* fill bar */}
              <motion.span
                className={`pointer-events-none absolute inset-y-0 left-0 ${
                  active
                    ? "bg-gradient-to-r from-honey/30 via-honey/15 to-transparent"
                    : "bg-honey/[0.06]"
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${pct * 100}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
              <div className="relative flex items-center gap-4">
                <span
                  className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-medium numeric ${
                    active
                      ? "bg-honey-glow text-ink"
                      : "border border-honey/25 text-honey-soft/65"
                  }`}
                >
                  {opt.id}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-honey-soft">{opt.label}</span>
                    {leader && total > 0 && (
                      <span className="rounded-full bg-honey/15 px-2 py-0.5 text-[9px] uppercase tracking-wider2 text-honey-soft/80">
                        leading
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-honey-soft/55 truncate">
                    {opt.description}
                  </div>
                </div>
                <div className="text-right shrink-0 numeric">
                  <div className="text-sm text-honey-soft">
                    {(pct * 100).toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-honey-soft/45">
                    {fmtNum(opt.votes)}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {myChoice && (
        <div className="mt-3 text-center text-[10px] uppercase tracking-wider2 text-honey-soft/50">
          You voted · option {myChoice}
        </div>
      )}
    </div>
  );
}
