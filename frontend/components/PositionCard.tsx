import { useState } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { useHiveActions, useStakerData } from "@/hooks/useHiveStake";
import { useCountdown } from "@/hooks/useCountdown";
import { fmtCountdown, fmtToken } from "@/lib/format";

const MULT_BY_DURATION: Record<number, string> = {
  86400: "1.0×",
  259200: "1.2×",
  604800: "1.5×",
};

export function PositionCard() {
  const { address } = useAccount();
  const data = useStakerData();
  const actions = useHiveActions();
  const remaining = useCountdown(data.lockEnd);
  const [busy, setBusy] = useState<string | null>(null);

  if (!address || data.staked === 0n) return null;

  const unlocked = remaining === 0;
  const total = Math.max(data.lockDuration, 1);
  const elapsed = Math.max(0, total - remaining);
  const progress = Math.min(1, elapsed / total);

  async function onClaim() {
    if (!address) return;
    setBusy("claim");
    try { await actions.claim(address); await data.refetch(); } finally { setBusy(null); }
  }
  async function onUnstake() {
    setBusy("unstake");
    try { await actions.unstake(); await data.refetch(); } finally { setBusy(null); }
  }

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-wider2 text-honey-soft/60">
          Your position
        </h2>
        <span className="text-[11px] text-honey-soft/45">
          {MULT_BY_DURATION[data.lockDuration] ?? "1.0×"} multiplier
        </span>
      </div>

      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/50">
          Staked
        </div>
        <div className="mt-1 text-3xl font-light text-honey-soft numeric">
          {fmtToken(data.staked)}{" "}
          <span className="text-base text-honey-soft/40">HIVE</span>
        </div>
      </div>

      {/* lock progress bar */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wider2 text-honey-soft/50">
          <span>{unlocked ? "Unlocked" : "Maturing"}</span>
          <span className="numeric">{fmtCountdown(remaining)}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-honey/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-honey-dark via-honey to-honey-glow shadow-honey"
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Pending label="HIVE" value={fmtToken(data.pendingHive)} />
        <Pending label="ETH" value={fmtToken(data.pendingEth)} />
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-2">
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          disabled={!unlocked || busy !== null || (data.pendingHive === 0n && data.pendingEth === 0n)}
          onClick={onClaim}
          className="flex-1 rounded-full bg-gradient-to-br from-honey-soft to-honey px-5 py-2.5 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all disabled:opacity-40 disabled:shadow-none"
        >
          {busy === "claim" ? "Claiming…" : unlocked ? "Claim" : "Locked"}
        </motion.button>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          disabled={busy !== null}
          onClick={onUnstake}
          title={unlocked ? "Unstake and claim" : "Unstaking before unlock forfeits rewards"}
          className="flex-1 rounded-full border border-honey/15 px-5 py-2.5 text-[12px] tracking-wider2 uppercase text-honey-soft/75 hover:border-honey/40 hover:text-honey-soft transition-all disabled:opacity-40"
        >
          {busy === "unstake"
            ? "Unstaking…"
            : unlocked
            ? "Unstake"
            : "Forfeit & exit"}
        </motion.button>
      </div>
    </div>
  );
}

function Pending({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-honey/10 bg-honey/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/50">
        Pending {label}
      </div>
      <div className="mt-1 text-lg font-light text-honey-soft numeric">{value}</div>
    </div>
  );
}
