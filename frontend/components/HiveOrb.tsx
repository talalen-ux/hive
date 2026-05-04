import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useMemo, useState, type PointerEvent } from "react";

/**
 * HiveOrb — a tilted hex dome with scattered glowing cells. Pure SVG +
 * CSS perspective (no Three.js); SSR-safe, lightweight, cinematic.
 *
 * Geometry: an axial-coordinate hex grid is projected to 2D, trimmed to a
 * disc, then CSS perspective tilts the SVG into a dome. Each cell picks
 * deterministic random "lit" / phase / speed values from its (q, r)
 * coordinates so the dome is stable across renders but every pulse fires on
 * its own beat.
 *
 * Hover: spring-smoothed parallax tilt + global glow boost. Idle: a slow
 * continuous Z-rotation drifts the surface so the eye keeps moving.
 */
type Props = {
  /** 0..1 — scales halo glow + ambient sparkle density. */
  intensity?: number;
};

const HEX_BASE_SIZE = 11;
const DOME_RADIUS = 230;
const RING_COUNT = 10;
const VIEW = 480;
const LIT_PROBABILITY = 0.44;

type Hex = {
  q: number;
  r: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  lit: boolean;
  pulseDelay: number;
  pulseDuration: number;
  /** 0..1 — scales the lit cell's brightness so the dome has hot + warm cells. */
  litStrength: number;
};

export function HiveOrb({ intensity = 0.85 }: Props) {
  const i = Math.max(0.2, Math.min(1, intensity));
  const hexes = useMemo(generateDome, []);
  const [hovered, setHovered] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const sx = useSpring(mouseX, { stiffness: 90, damping: 14, mass: 0.4 });
  const sy = useSpring(mouseY, { stiffness: 90, damping: 14, mass: 0.4 });

  const rotateX = useTransform(sy, [-1, 1], [50, 26]);
  const rotateY = useTransform(sx, [-1, 1], [-14, 14]);

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mouseX.set(Math.max(-1, Math.min(1, nx)));
    mouseY.set(Math.max(-1, Math.min(1, ny)));
  }
  function onPointerLeave() {
    mouseX.set(0);
    mouseY.set(0);
    setHovered(false);
  }

  const hoverBoost = hovered ? 1.85 : 1;

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[820px]"
      onPointerMove={onPointerMove}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={onPointerLeave}
    >
      {/* outer halo — pulses harder than before, faster cadence */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.13, 1],
          opacity: [0.55, 1, 0.55],
        }}
        transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity }}
        style={{
          background: `radial-gradient(circle at 50% 60%, rgba(255,215,106,${0.62 * i * hoverBoost}), transparent 58%)`,
        }}
      />

      {/* secondary halo — counter-pulses for interference */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-[-6%] rounded-full blur-3xl"
        animate={{
          scale: [1.05, 0.96, 1.05],
          opacity: [0.45, 0.85, 0.45],
        }}
        transition={{ duration: 4.6, ease: "easeInOut", repeat: Infinity }}
        style={{
          background: `radial-gradient(circle at 50% 50%, rgba(255,200,90,${0.32 * i * hoverBoost}), transparent 65%)`,
        }}
      />

      {/* ground glow — pooled light beneath the dome */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-[14%] bottom-[-3%] h-[16%] rounded-[50%] blur-2xl"
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{ duration: 3.8, ease: "easeInOut", repeat: Infinity }}
        style={{
          background: `radial-gradient(ellipse at center, rgba(255,200,90,${0.7 * i * hoverBoost}), transparent 70%)`,
        }}
      />

      {/* tilted dome of hexagons */}
      <div className="absolute inset-0 dome-perspective">
        <motion.svg
          viewBox={`-${VIEW / 2} -${VIEW / 2} ${VIEW} ${VIEW}`}
          className="h-full w-full"
          aria-hidden
          style={{
            rotateX,
            rotateY,
            scaleY: 0.92,
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          {/* slow continuous Z-rotation — gives the surface life on idle. */}
          <motion.g
            animate={{ rotate: 360 }}
            transition={{ duration: 80, ease: "linear", repeat: Infinity }}
          >
            <defs>
              <radialGradient id="hexLit" cx="50%" cy="40%" r="65%">
                <stop offset="0%" stopColor="#FFF1B8" stopOpacity="1" />
                <stop offset="55%" stopColor="#F5B942" stopOpacity="1" />
                <stop offset="100%" stopColor="#7A4C0F" stopOpacity="0.5" />
              </radialGradient>
              <linearGradient id="hexDim" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="rgba(245,185,66,0.12)" />
                <stop offset="100%" stopColor="rgba(60,40,20,0.06)" />
              </linearGradient>
            </defs>

            <circle
              cx="0"
              cy="0"
              r={DOME_RADIUS + 18}
              fill="none"
              stroke="rgba(255,215,106,0.22)"
              strokeDasharray="1.5 7"
              strokeWidth="0.7"
            />
            <circle
              cx="0"
              cy="0"
              r={DOME_RADIUS + 38}
              fill="none"
              stroke="rgba(255,215,106,0.12)"
              strokeDasharray="1 12"
              strokeWidth="0.5"
            />

            {hexes.map((h, idx) => (
              <HexCell key={idx} hex={h} />
            ))}
          </motion.g>
        </motion.svg>
      </div>

      {/* ambient sparkles drifting around the dome edge — denser + brighter */}
      <Sparkles intensity={i} hoverBoost={hoverBoost} />
    </div>
  );
}

function HexCell({ hex }: { hex: Hex }) {
  const points = hexPoints(hex.size);
  if (!hex.lit) {
    return (
      <g
        transform={`translate(${hex.x.toFixed(2)} ${hex.y.toFixed(2)})`}
        opacity={hex.opacity}
      >
        <polygon
          points={points}
          fill="url(#hexDim)"
          stroke="rgba(245,185,66,0.36)"
          strokeWidth="0.7"
        />
      </g>
    );
  }
  // Stronger glow + faster animation for lit cells. Three "heat tiers" so
  // some cells feel hotter than others — the dome reads as varied rather
  // than a single beat.
  const glowPx = 8 + hex.litStrength * 12;
  return (
    <g
      transform={`translate(${hex.x.toFixed(2)} ${hex.y.toFixed(2)})`}
      opacity={hex.opacity}
    >
      <polygon
        points={points}
        fill="url(#hexLit)"
        stroke="rgba(255,225,140,0.85)"
        strokeWidth="0.8"
        style={{
          animation: `hexPulse ${hex.pulseDuration.toFixed(2)}s ease-in-out ${hex.pulseDelay.toFixed(2)}s infinite`,
          filter: `drop-shadow(0 0 ${glowPx.toFixed(1)}px rgba(255, 215, 106, ${0.7 + hex.litStrength * 0.3}))`,
        }}
      />
    </g>
  );
}

function Sparkles({
  intensity,
  hoverBoost,
}: {
  intensity: number;
  hoverBoost: number;
}) {
  const sparks = useMemo(() => {
    const out: Array<{
      left: string;
      top: string;
      size: number;
      delay: number;
      duration: number;
    }> = [];
    const count = 42;
    for (let n = 0; n < count; n++) {
      const r = (k: number) => ((Math.sin(n * 73 + k * 31) + 1) / 2);
      const angle = (n / count) * Math.PI * 2 + r(1) * 0.6;
      // two rings — inner edge of the dome + a wider halo
      const ringFar = n % 2 === 0;
      const radius = ringFar ? 0.46 + r(2) * 0.06 : 0.52 + r(2) * 0.08;
      const left = 50 + Math.cos(angle) * radius * 100;
      const top = 50 + Math.sin(angle) * radius * 80;
      out.push({
        left: `${left.toFixed(2)}%`,
        top: `${top.toFixed(2)}%`,
        size: 1.2 + r(3) * 2.6,
        delay: r(4) * 5,
        duration: 2.4 + r(5) * 3.2,
      });
    }
    return out;
  }, []);

  return (
    <>
      {sparks.map((s, idx) => (
        <span
          key={idx}
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-honey-glow blur-[1px]"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            opacity: 0.75 * intensity * hoverBoost,
            animation: `hexPulse ${s.duration.toFixed(2)}s ease-in-out ${s.delay.toFixed(2)}s infinite`,
            boxShadow: "0 0 14px rgba(255, 215, 106, 1)",
          }}
        />
      ))}
    </>
  );
}

// ───────────────── geometry helpers ─────────────────

function hexPoints(size: number): string {
  const w = size;
  const h = (size * Math.sqrt(3)) / 2;
  return `${w},0 ${w / 2},${h} ${-w / 2},${h} ${-w},0 ${-w / 2},${-h} ${w / 2},${-h}`;
}

function pseudoRandom(q: number, r: number, salt: number): number {
  const s = Math.sin(q * 12.9898 + r * 78.233 + salt * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

function generateDome(): Hex[] {
  const out: Hex[] = [];
  for (let q = -RING_COUNT; q <= RING_COUNT; q++) {
    const r1 = Math.max(-RING_COUNT, -q - RING_COUNT);
    const r2 = Math.min(RING_COUNT, -q + RING_COUNT);
    for (let r = r1; r <= r2; r++) {
      const x = HEX_BASE_SIZE * 1.5 * q;
      const y = HEX_BASE_SIZE * Math.sqrt(3) * (r + q / 2);
      const dist = Math.sqrt(x * x + y * y);
      if (dist > DOME_RADIUS) continue;
      // Center cell is now part of the grid (no separate core layer).

      const t = dist / DOME_RADIUS;
      const sphereY = Math.cos((t * Math.PI) / 2);

      const litRand = pseudoRandom(q, r, 7);
      const lit = litRand < LIT_PROBABILITY;
      out.push({
        q,
        r,
        x,
        y,
        size: HEX_BASE_SIZE * (0.78 + sphereY * 0.22),
        opacity: 0.5 + sphereY * 0.5,
        lit,
        litStrength: pseudoRandom(q, r, 17),
        // Faster pulse cadence than before for a more alive feel.
        pulseDelay: pseudoRandom(q, r, 23) * 4,
        pulseDuration: 1.8 + pseudoRandom(q, r, 29) * 2.0,
      });
    }
  }
  return out;
}
