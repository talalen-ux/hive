import { motion } from "framer-motion";

type Props = {
  /** 0..1 — how much of the chamber is filled with honey. */
  fill: number;
  /** rendered when the user is currently submitting a stake — pulses brighter. */
  active?: boolean;
};

const ROWS = 5;
const COLS = 7;

export function HiveChamber({ fill, active }: Props) {
  const total = ROWS * COLS;
  const filled = Math.round(Math.min(1, Math.max(0, fill)) * total);

  return (
    <div className="relative aspect-square w-full max-w-[440px] mx-auto">
      {/* faint outer halo */}
      <div className="absolute -inset-6 rounded-[40%] bg-[radial-gradient(circle,rgba(255,215,106,0.10),transparent_70%)] blur-2xl" />

      <div className="relative grid h-full grid-cols-7 gap-1.5 p-4">
        {Array.from({ length: total }).map((_, i) => {
          const isFilled = i < filled;
          const row = Math.floor(i / COLS);
          const offset = row % 2 === 1 ? "translate-x-[18%]" : "";
          return (
            <motion.div
              key={i}
              className={`relative ${offset}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.012, duration: 0.4 }}
            >
              <span
                className={`hex-clip absolute inset-0 ${
                  isFilled
                    ? "bg-gradient-to-br from-honey-glow via-honey to-honey-dark"
                    : "bg-honey/[0.06]"
                }`}
              />
              <span
                className={`hex-clip absolute inset-[2px] ${
                  isFilled ? "bg-gradient-to-br from-honey/80 to-honey-dark/40" : "bg-ink/80"
                }`}
              />
              {isFilled && (
                <motion.span
                  className="hex-clip absolute inset-[6px] bg-honey-glow/50 mix-blend-screen"
                  animate={{
                    opacity: active ? [0.5, 0.95, 0.5] : [0.25, 0.55, 0.25],
                  }}
                  transition={{
                    duration: 2 + (i % 5) * 0.3,
                    ease: "easeInOut",
                    repeat: Infinity,
                  }}
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
