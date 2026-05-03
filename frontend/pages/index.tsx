import Link from "next/link";
import { motion } from "framer-motion";
import { formatUnits } from "viem";
import { HiveOrb } from "@/components/HiveOrb";
import { CountUp } from "@/components/CountUp";
import { useStakerData } from "@/hooks/useHiveStake";

export default function Dashboard() {
  const data = useStakerData();
  const tvl = num(data.totalStaked);
  // Use effectiveWeighted to hide the burn-floor (DEAD seed).
  const weighted = num(data.effectiveWeighted);
  // intensity ~= log10(TVL) / 7 for a non-linear, slow-saturating glow
  const intensity =
    tvl > 0 ? Math.min(1, 0.35 + Math.log10(tvl + 10) / 7) : 0.4;

  return (
    <div className="pt-8 sm:pt-16">
      <div className="text-center">
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-[11px] uppercase tracking-wider2 text-honey-soft/60"
        >
          A living digital hive
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          className="mt-3 text-4xl sm:text-6xl font-light tracking-tight text-gradient-honey"
        >
          Powered by capital.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.7 }}
          className="mx-auto mt-5 max-w-xl text-sm sm:text-base font-light text-honey-soft/60"
        >
          an experiment in decentralized funding
        </motion.p>
      </div>

      <div className="relative mt-12 sm:mt-20">
        <HiveOrb intensity={intensity} />
      </div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
        }}
        className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        <Stat label="Total Hive TVL" value={tvl} suffix=" HIVE" />
        <Stat label="Weighted Stake" value={weighted} suffix="" />
        <Stat
          label="Active Bees"
          value={tvl > 0 ? Math.max(1, Math.round(tvl / 1000)) : 0}
          suffix=""
          decimals={0}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.6 }}
        className="mt-14 flex flex-col items-center gap-3"
      >
        <Link
          href="/stake"
          className="group relative inline-flex items-center gap-3 rounded-full bg-gradient-to-br from-honey-soft to-honey px-7 py-3 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all"
        >
          Enter the Hive
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </Link>
        <span className="text-[11px] uppercase tracking-wider2 text-honey-soft/40">
          24h · 3d · 7d locks
        </span>
      </motion.div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  decimals = 2,
}: {
  label: string;
  value: number;
  suffix: string;
  decimals?: number;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.6 } },
      }}
      whileHover={{ y: -3 }}
      className="glass-panel rounded-2xl px-6 py-5 transition-shadow hover:shadow-honey"
    >
      <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/55">
        {label}
      </div>
      <div className="mt-2 text-2xl sm:text-3xl font-light text-honey-soft">
        <CountUp value={value} decimals={decimals} suffix={suffix} />
      </div>
    </motion.div>
  );
}

function num(v: bigint, decimals = 18): number {
  const s = formatUnits(v, decimals);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
