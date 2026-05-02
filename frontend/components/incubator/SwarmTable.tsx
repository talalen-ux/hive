import { motion } from "framer-motion";
import { fmtAddress, fmtNum, type SwarmEntry } from "@/lib/incubator";

export function SwarmTable({ entries }: { entries: SwarmEntry[] }) {
  return (
    <div className="glass-panel overflow-hidden rounded-2xl">
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-6 py-3 text-[10px] uppercase tracking-wider2 text-honey-soft/45 border-b border-honey/10">
        <span>#</span>
        <span>wallet</span>
        <span className="hidden sm:inline">votes</span>
        <span>accuracy</span>
        <span>influence</span>
      </div>

      <div>
        {entries.map((e, i) => (
          <motion.div
            key={e.address}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.4 }}
            className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-6 py-3 border-b border-honey/[0.06] hover:bg-honey/[0.03] transition-colors"
          >
            <span className="text-[12px] text-honey-soft/55 numeric w-5">{e.rank}</span>
            <span className="text-sm text-honey-soft numeric truncate">
              {fmtAddress(e.address)}
            </span>
            <span className="hidden sm:inline text-[12px] text-honey-soft/65 numeric">
              {e.votesCast}
            </span>
            <span className="text-[12px] text-honey-soft numeric">
              {e.accuracy}%
            </span>
            <span className="text-[12px] text-honey numeric">
              {fmtNum(e.influence)}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
