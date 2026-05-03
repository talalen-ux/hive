import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useMemo, useState, type PointerEvent } from "react";

/**
 * HiveOrb — a tilted hex dome with scattered glowing cells and a luminous
 * central core. Pure SVG + CSS perspective (no Three.js); stays SSR-safe and
 * lightweight while still feeling cinematic.
 *
 * Geometry: an axial-coordinate hex grid is projected to 2D and trimmed to a
 * disc, then CSS perspective tilts the whole thing into a dome. Each cell
 * picks deterministic random "lit" / phase / speed values from its (q, r)
 * coordinates so the dome is stable across renders but every pulse fires on
 * its own beat. The central hex is rendered as a separate untilted layer so
 * it stays flat to the camera.
 *
 * Hover: the dome tracks the mouse with spring-smoothed parallax tilt and a
 * temporary glow boost. The central core scales up slightly on enter.
 */
type Props = {
  /** 0..1 — scales halo glow + ambient sparkle density. */
  intensity?: number;
};

const HEX_BASE_SIZE = 12;
const DOME_RADIUS = 218;
const RING_COUNT = 9;
const VIEW = 480;
const LIT_PROBABILITY = 0.34;

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
};

export function HiveOrb({ intensity = 0.7 }: Props) {
  const i = Math.max(0.15, Math.min(1, intensity));
  const hexes = useMemo(generateDome, []);
  const [hovered, setHovered] = useState(false);

  // Mouse-tracked parallax. mouseX/Y are normalised to [-1, 1] within the
  // container; springs smooth the motion so quick movements don't snap.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const sx = useSpring(mouseX, { stiffness: 80, damping: 16, mass: 0.4 });
  const sy = useSpring(mouseY, { stiffness: 80, damping: 16, mass: 0.4 });

  // Base tilt is rotateX(38deg). On hover, ±8° of additional X (looking up
  // /down) and ±10° of Y (looking left/right) follows the cursor.
  const rotateX = useTransform(sy, [-1, 1], [46, 30]);
  const rotateY = useTransform(sx, [-1, 1], [-10, 10]);

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

  // Hover pumps the glow ~1.5× and slightly brightens lit cells. The bump is
  // applied to halo, ground glow, sparkles, and core bloom; per-cell colour
  // stays the same to avoid restarting every CSS pulse.
  const hoverBoost = hovered ? 1.5 : 1;

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[560px]"
      onPointerMove={onPointerMove}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={onPointerLeave}
    >
      {/* outer halo — ambient glow under the dome */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.06, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}
        style={{
          background: `radial-gradient(circle at 50% 60%, rgba(255,215,106,${0.42 * i * hoverBoost}), transparent 60%)`,
        }}
      />

      {/* ground glow — pooled light beneath the dome */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-[18%] bottom-[-2%] h-[14%] rounded-[50%] blur-2xl"
        animate={{ opacity: hovered ? 1 : 0.85 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{
          background: `radial-gradient(ellipse at center, rgba(255,200,90,${0.55 * i * hoverBoost}), transparent 70%)`,
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
          <defs>
            <radialGradient id="hexLit" cx="50%" cy="40%" r="65%">
              <stop offset="0%" stopColor="#FFE9A8" stopOpacity="1" />
              <stop offset="55%" stopColor="#F5B942" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#7A4C0F" stopOpacity="0.4" />
            </radialGradient>
            <linearGradient id="hexDim" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="rgba(245,185,66,0.10)" />
              <stop offset="100%" stopColor="rgba(60,40,20,0.05)" />
            </linearGradient>
          </defs>

          <circle
            cx="0"
            cy="0"
            r={DOME_RADIUS + 18}
            fill="none"
            stroke="rgba(255,215,106,0.18)"
            strokeDasharray="1.5 7"
            strokeWidth="0.7"
          />
          <circle
            cx="0"
            cy="0"
            r={DOME_RADIUS + 38}
            fill="none"
            stroke="rgba(255,215,106,0.07)"
            strokeDasharray="1 12"
            strokeWidth="0.5"
          />

          {hexes.map((h, idx) => (
            <HexCell key={idx} hex={h} />
          ))}
        </motion.svg>
      </div>

      {/* central core — rendered untilted on top so it always faces the camera */}
      <CentralCore intensity={i} hovered={hovered} />

      {/* ambient sparkles drifting around the dome edge */}
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
          stroke="rgba(245,185,66,0.32)"
          strokeWidth="0.7"
        />
      </g>
    );
  }
  return (
    <g
      transform={`translate(${hex.x.toFixed(2)} ${hex.y.toFixed(2)})`}
      opacity={hex.opacity}
    >
      <polygon
        points={points}
        fill="url(#hexLit)"
        stroke="rgba(255,215,106,0.7)"
        strokeWidth="0.7"
        style={{
          animation: `hexPulse ${hex.pulseDuration.toFixed(2)}s ease-in-out ${hex.pulseDelay.toFixed(2)}s infinite`,
        }}
      />
    </g>
  );
}

function CentralCore({
  intensity,
  hovered,
}: {
  intensity: number;
  hovered: boolean;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute left-1/2 top-1/2 h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2"
      animate={{ scale: hovered ? 1.08 : 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
    >
      {/* backlight bloom */}
      <motion.div
        aria-hidden
        className="absolute inset-[-60%] rounded-full blur-2xl"
        animate={{ opacity: hovered ? 1 : 0.85 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{
          background: `radial-gradient(circle, rgba(255,220,120,${0.7 * intensity}), transparent 65%)`,
        }}
      />

      <motion.div
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
        className="relative h-full w-full"
      >
        <span className="hex-clip absolute inset-0 bg-gradient-to-br from-honey-glow via-honey to-honey-dark shadow-honeyStrong" />
        <span className="hex-clip absolute inset-[6%] bg-gradient-to-br from-honey-deep to-ink" />
        <span
          className="hex-clip absolute inset-[14%] dome-core-pulse"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, #FFE9A8 0%, #F5B942 40%, #C89B3C 75%, #1A1208 100%)",
          }}
        />
        <span
          className="hex-clip absolute inset-[36%]"
          style={{
            background:
              "radial-gradient(circle, #FFF1B8 0%, #FFD76A 60%, #F5B942 100%)",
            filter: "drop-shadow(0 0 12px rgba(255,215,106,1))",
          }}
        />
      </motion.div>
    </motion.div>
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
    const count = 26;
    for (let n = 0; n < count; n++) {
      const r = (k: number) => ((Math.sin(n * 73 + k * 31) + 1) / 2);
      const angle = (n / count) * Math.PI * 2 + r(1) * 0.6;
      const radius = 0.45 + r(2) * 0.08;
      const left = 50 + Math.cos(angle) * radius * 100;
      const top = 50 + Math.sin(angle) * radius * 80;
      out.push({
        left: `${left.toFixed(2)}%`,
        top: `${top.toFixed(2)}%`,
        size: 1 + r(3) * 2.4,
        delay: r(4) * 6,
        duration: 4 + r(5) * 4,
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
            opacity: 0.6 * intensity * hoverBoost,
            animation: `hexPulse ${s.duration.toFixed(2)}s ease-in-out ${s.delay.toFixed(2)}s infinite`,
            boxShadow: "0 0 10px rgba(255, 215, 106, 0.95)",
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
      if (q === 0 && r === 0) continue;

      const t = dist / DOME_RADIUS;
      const sphereY = Math.cos((t * Math.PI) / 2);

      const lit = pseudoRandom(q, r, 7) < LIT_PROBABILITY;
      out.push({
        q,
        r,
        x,
        y,
        size: HEX_BASE_SIZE * (0.78 + sphereY * 0.22),
        opacity: 0.45 + sphereY * 0.55,
        lit,
        pulseDelay: pseudoRandom(q, r, 23) * 5,
        pulseDuration: 2.6 + pseudoRandom(q, r, 29) * 2.6,
      });
    }
  }
  return out;
}
