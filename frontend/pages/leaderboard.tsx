import { useMemo } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { formatUnits } from "viem";
import { useStakerData } from "@/hooks/useHiveStake";
import { CountUp } from "@/components/CountUp";

type Entry = { rank: number; address: string; staked: number; lock: string };

export default function Leaderboard() {
  const { address } = useAccount();
  const data = useStakerData();
  const userStake = num(data.staked);

  const entries = useMemo<Entry[]>(() => {
    // Placeholder leaderboard — until the subgraph is wired in we synthesize
    // a deterministic ladder from the live total weighted stake. Replace
    // with `useTopStakers()` (subgraph) when available.
    const total = num(data.effectiveWeighted) || num(data.totalStaked) || 0;
    const seed = total > 0 ? total : 100_000;
    const list: Entry[] = Array.from({ length: 10 }, (_, i) => {
      const decay = Math.pow(0.78, i);
      return {
        rank: i + 1,
        address: synthAddress(i),
        staked: seed * decay * 0.18,
        lock: "open",
      };
    });
    if (address && userStake > 0) {
      const myEntry: Entry = {
        rank: 0,
        address,
        staked: userStake,
        lock: "open",
      };
      list.push(myEntry);
      list.sort((a, b) => b.staked - a.staked);
      list.forEach((e, i) => (e.rank = i + 1));
    }
    return list.slice(0, 10);
  }, [address, userStake, data.totalStaked]);

  return (
    <div className="pt-6 sm:pt-12">
      <header className="text-center">
        <p className="text-[11px] uppercase tracking-wider2 text-honey-soft/55">
          The deepest in the hive
        </p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-light tracking-tight text-gradient-honey">
          Queen Bees
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-honey-soft/55">
          Top stakers signal conviction. Anonymous by default, forever.
        </p>
      </header>

      <div className="mt-12 mx-auto max-w-3xl space-y-2">
        {entries.map((e, i) => (
          <LeaderRow
            key={`${e.address}-${e.rank}`}
            entry={e}
            mine={!!address && e.address.toLowerCase() === address.toLowerCase()}
            i={i}
          />
        ))}
      </div>
    </div>
  );
}

function LeaderRow({
  entry,
  mine,
  i,
}: {
  entry: Entry;
  mine: boolean;
  i: number;
}) {
  const isPodium = entry.rank <= 3;
  const intensity = entry.rank === 1 ? 1 : entry.rank === 2 ? 0.75 : entry.rank === 3 ? 0.55 : 0.3;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04, duration: 0.5 }}
      whileHover={{ y: -2 }}
      className={`group relative flex items-center justify-between rounded-2xl border px-5 py-4 transition-all ${
        isPodium
          ? "border-honey/30 bg-honey/[0.05] hover:border-honey/60 hover:shadow-honey"
          : "border-honey/10 bg-honey/[0.02] hover:border-honey/25"
      } ${mine ? "ring-1 ring-honey/40" : ""}`}
    >
      <div className="flex items-center gap-4">
        <div className="relative h-9 w-9">
          <span
            className="hex-clip absolute inset-0"
            style={{
              background: `linear-gradient(135deg, rgba(255,215,106,${intensity}) 0%, rgba(245,185,66,${intensity * 0.7}) 50%, rgba(26,18,8,1) 100%)`,
            }}
          />
          <span className="absolute inset-0 grid place-items-center text-[12px] font-medium text-ink numeric">
            {entry.rank}
          </span>
          {entry.rank === 1 && (
            <motion.span
              className="absolute -inset-1 hex-clip"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,215,106,0.5), transparent 70%)",
              }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
            />
          )}
        </div>
        <div>
          <div className="text-sm font-light text-honey-soft numeric">
            {trunc(entry.address)}
            {mine && (
              <span className="ml-2 text-[10px] uppercase tracking-wider2 text-honey">
                you
              </span>
            )}
          </div>
          <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/45">
            staked
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-base font-light text-honey-soft">
          <CountUp value={entry.staked} decimals={2} />
          <span className="ml-1 text-[11px] text-honey-soft/40">HIVE</span>
        </div>
      </div>
    </motion.div>
  );
}

function num(v: bigint, decimals = 18): number {
  const n = Number(formatUnits(v, decimals));
  return Number.isFinite(n) ? n : 0;
}
function trunc(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
function synthAddress(i: number): string {
  // deterministic, obviously fake addresses for the placeholder ladder
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  let out = "0x";
  for (let j = 0; j < 20; j++) {
    out += hex((i * 37 + j * 11 + 7) & 0xff);
  }
  return out;
}
