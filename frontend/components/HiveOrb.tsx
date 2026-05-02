import { motion } from "framer-motion";

type Props = {
  /** 0..1 — scales the glow intensity. */
  intensity?: number;
};

export function HiveOrb({ intensity = 0.6 }: Props) {
  const i = Math.max(0.15, Math.min(1, intensity));
  return (
    <div className="relative mx-auto h-[360px] w-[360px] sm:h-[440px] sm:w-[440px]">
      {/* outer halo */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle at center, rgba(255,215,106,${0.35 * i}), transparent 65%)`,
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}
      />

      {/* slow rotating hex ring */}
      <div className="absolute inset-6 animate-rotateSlow">
        <HexRing radius={170} count={6} />
      </div>
      <div
        className="absolute inset-16 animate-rotateSlow"
        style={{ animationDirection: "reverse", animationDuration: "90s" }}
      >
        <HexRing radius={120} count={6} />
      </div>

      {/* breathing core */}
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2"
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
      >
        <div className="hex-clip absolute inset-0 bg-gradient-to-br from-honey-glow via-honey to-honey-dark shadow-honeyStrong" />
        <div className="hex-clip absolute inset-[6px] bg-gradient-to-br from-honey-deep to-ink" />
        <div
          className="hex-clip absolute inset-[18px] animate-breathe"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, #FFD76A 0%, #F5B942 40%, #C89B3C 75%, #1A1208 100%)",
          }}
        />
        {/* inner flicker */}
        <motion.div
          className="hex-clip absolute inset-[40px] bg-honey-glow/60 mix-blend-screen"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
        />
      </motion.div>
    </div>
  );
}

function HexRing({ radius, count }: { radius: number; count: number }) {
  return (
    <svg
      viewBox="-200 -200 400 400"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <polygon
              points="0,-12 10.4,-6 10.4,6 0,12 -10.4,6 -10.4,-6"
              fill="rgba(245,185,66,0.10)"
              stroke="rgba(255,215,106,0.45)"
              strokeWidth="0.8"
            />
          </g>
        );
      })}
      <circle
        cx="0"
        cy="0"
        r={radius}
        fill="none"
        stroke="rgba(245,185,66,0.08)"
        strokeDasharray="2 6"
      />
    </svg>
  );
}
