import { useState } from "react";
import { motion } from "framer-motion";
import { StakeCard } from "@/components/StakeCard";
import { PositionCard } from "@/components/PositionCard";
import { HiveChamber } from "@/components/HiveChamber";
import { useStakerData } from "@/hooks/useHiveStake";
import { useCountdown } from "@/hooks/useCountdown";

export default function StakePage() {
  const data = useStakerData();
  const remaining = useCountdown(data.lockEnd);
  const total = Math.max(data.lockDuration, 1);
  const elapsed = Math.max(0, total - remaining);
  const progress = data.staked > 0n ? Math.min(1, elapsed / total) : 0;

  const [activity, setActivity] = useState<"approving" | "staking" | "idle">("idle");
  const fill = activity === "staking" ? Math.min(1, progress + 0.25) : progress;

  return (
    <div className="pt-6 sm:pt-12">
      <header className="text-center">
        <p className="text-[11px] uppercase tracking-wider2 text-honey-soft/55">
          Step into the chamber
        </p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-light tracking-tight text-gradient-honey">
          Enter the Hive
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-honey-soft/55">
          Lock your $HIVE for 24h, 3d, or 7d. Deeper locks earn deeper share.
        </p>
      </header>

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-6 order-2 lg:order-1"
        >
          <StakeCard onActivity={setActivity} />
          <PositionCard />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          className="order-1 lg:order-2"
        >
          <HiveChamber fill={fill} active={activity !== "idle"} />
          <p className="mt-6 text-center text-[11px] uppercase tracking-wider2 text-honey-soft/45 numeric">
            {data.staked > 0n
              ? `Chamber ${(progress * 100).toFixed(0)}% matured`
              : "Empty chamber — awaiting honey"}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
