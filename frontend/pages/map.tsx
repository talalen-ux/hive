import { useMemo } from "react";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { useStakerData } from "@/hooks/useHiveStake";

type Node = {
  id: number;
  x: number;
  y: number;
  size: number;
  intensity: number;
  isMe?: boolean;
};

const W = 800;
const H = 520;
const NODE_COUNT = 28;

export default function HiveMap() {
  const { address } = useAccount();
  const data = useStakerData();
  const myStake = num(data.staked);
  const tvl = num(data.totalStaked) || 1;
  const myWeight = myStake / tvl;

  const nodes = useMemo<Node[]>(() => {
    return Array.from({ length: NODE_COUNT }, (_, i) => {
      const r = (n: number) => ((Math.sin(i * 137 + n) + 1) / 2);
      const radius = 60 + r(1) * 180;
      const angle = r(2) * Math.PI * 2;
      const x = W / 2 + Math.cos(angle) * radius;
      const y = H / 2 + Math.sin(angle) * radius * 0.65;
      const intensity = 0.2 + r(3) * 0.8;
      return {
        id: i,
        x,
        y,
        size: 6 + intensity * 14,
        intensity,
      };
    });
  }, []);

  const me: Node | null = address
    ? {
        id: -1,
        x: W / 2,
        y: H / 2,
        size: 14 + myWeight * 60,
        intensity: 0.9,
        isMe: true,
      }
    : null;

  const edges = useMemo(() => {
    const out: { a: Node; b: Node; key: string }[] = [];
    nodes.forEach((n, i) => {
      // connect each node to its 2 nearest neighbors (deterministic)
      const dists = nodes
        .map((m) => ({ m, d: Math.hypot(n.x - m.x, n.y - m.y) }))
        .filter((p) => p.m.id !== n.id)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2);
      dists.forEach(({ m }) => {
        const key = [n.id, m.id].sort().join("-");
        if (!out.find((e) => e.key === key)) out.push({ a: n, b: m, key });
      });
      // connect a few to center
      if (me && i % 4 === 0) {
        out.push({ a: n, b: me, key: `me-${n.id}` });
      }
    });
    return out;
  }, [nodes, me]);

  return (
    <div className="pt-6 sm:pt-12">
      <header className="text-center">
        <p className="text-[11px] uppercase tracking-wider2 text-honey-soft/55">
          The hive is alive
        </p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-light tracking-tight text-gradient-honey">
          Hive Map
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-honey-soft/55">
          Each node is a staker cluster. Lines pulse as nectar flows between
          them.
        </p>
      </header>

      <div className="mt-12 mx-auto max-w-5xl glass-panel rounded-2xl p-4 sm:p-6">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full h-auto"
          aria-label="Hive network map"
        >
          <defs>
            <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFD76A" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#F5B942" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#1A1208" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F5B942" stopOpacity="0" />
              <stop offset="50%" stopColor="#FFD76A" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#F5B942" stopOpacity="0" />
            </linearGradient>
          </defs>

          {edges.map((e, i) => (
            <motion.line
              key={e.key}
              x1={e.a.x}
              y1={e.a.y}
              x2={e.b.x}
              y2={e.b.y}
              stroke="url(#edge-grad)"
              strokeWidth={0.8}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.15, 0.55, 0.15] }}
              transition={{
                duration: 4 + (i % 5),
                ease: "easeInOut",
                repeat: Infinity,
                delay: (i % 7) * 0.4,
              }}
            />
          ))}

          {nodes.map((n) => (
            <Hex key={n.id} node={n} />
          ))}
          {me && <Hex node={me} />}
        </svg>

        <div className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-wider2 text-honey-soft/50">
          <span>{NODE_COUNT} clusters</span>
          {address && (
            <span>
              your weight ·{" "}
              <span className="text-honey-soft numeric">
                {(myWeight * 100).toFixed(2)}%
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Hex({ node }: { node: Node }) {
  const s = node.size;
  const points = `0,-${s} ${s * 0.866},-${s / 2} ${s * 0.866},${s / 2} 0,${s} -${s * 0.866},${s / 2} -${s * 0.866},-${s / 2}`;
  return (
    <g transform={`translate(${node.x} ${node.y})`}>
      <motion.circle
        r={s * 2.2}
        fill="url(#node-glow)"
        opacity={node.intensity * 0.6}
        animate={{ opacity: [node.intensity * 0.4, node.intensity * 0.8, node.intensity * 0.4] }}
        transition={{ duration: 4 + (node.id % 5), ease: "easeInOut", repeat: Infinity }}
      />
      <polygon
        points={points}
        fill={node.isMe ? "#FFD76A" : "rgba(245,185,66,0.85)"}
        stroke={node.isMe ? "#FFCC66" : "rgba(255,215,106,0.6)"}
        strokeWidth={node.isMe ? 1.5 : 0.8}
      />
      {node.isMe && (
        <text
          y={s + 12}
          textAnchor="middle"
          fontSize="10"
          fill="#FFCC66"
          letterSpacing="2"
        >
          YOU
        </text>
      )}
    </g>
  );
}

function num(v: bigint, decimals = 18): number {
  const n = Number(formatUnits(v, decimals));
  return Number.isFinite(n) ? n : 0;
}
