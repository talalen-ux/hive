import { motion } from "framer-motion";
import { LOCK_TIERS } from "@/lib/addresses";

type Props = {
  value: number;
  onChange: (seconds: number) => void;
};

export function LockTierPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {LOCK_TIERS.map((t) => {
        const active = value === t.seconds;
        return (
          <motion.button
            key={t.seconds}
            type="button"
            onClick={() => onChange(t.seconds)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={`relative rounded-xl border px-3 py-4 text-left transition-all ${
              active
                ? "border-honey/60 bg-honey/[0.08] shadow-honey"
                : "border-honey/10 bg-honey/[0.02] hover:border-honey/30"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/55">
              {t.label}
            </div>
            <div className="mt-1.5 text-xl font-light text-honey-soft numeric">
              {t.multiplier.toFixed(1)}×
            </div>
            {active && (
              <motion.span
                layoutId="lock-tier-glow"
                className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-honey/40"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
