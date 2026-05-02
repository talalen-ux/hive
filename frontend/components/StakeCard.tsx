import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { motion } from "framer-motion";
import { LockTierPicker } from "./LockTierPicker";
import { useHiveActions, useHiveContext, useStakerData } from "@/hooks/useHiveStake";
import { fmtToken } from "@/lib/format";

type Props = {
  onActivity?: (kind: "approving" | "staking" | "idle") => void;
};

export function StakeCard({ onActivity }: Props) {
  const { address } = useAccount();
  const { live } = useHiveContext();
  const data = useStakerData();
  const actions = useHiveActions();
  const [amount, setAmount] = useState("");
  const [lock, setLock] = useState(24 * 60 * 60);
  const [busy, setBusy] = useState<string | null>(null);

  const parsed = useMemo(() => {
    try { return amount ? parseUnits(amount, 18) : 0n; } catch { return 0n; }
  }, [amount]);

  const needsApproval = parsed > 0n && parsed > data.allowance;

  async function onApprove() {
    setBusy("approve");
    onActivity?.("approving");
    try { await actions.approve(amount); await data.refetch(); } finally {
      setBusy(null);
      onActivity?.("idle");
    }
  }
  async function onStake() {
    setBusy("stake");
    onActivity?.("staking");
    try { await actions.stake(amount, lock); setAmount(""); await data.refetch(); } finally {
      setBusy(null);
      onActivity?.("idle");
    }
  }

  if (!address) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <p className="text-honey-soft/70 text-sm">
          Connect a wallet to enter the hive.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-wider2 text-honey-soft/60">
          Stake
        </h2>
        <span className="text-[11px] text-honey-soft/45 numeric">
          {fmtToken(data.balance)} HIVE available
        </span>
      </div>

      <div className="mt-5">
        <label className="block text-[10px] uppercase tracking-wider2 text-honey-soft/50">
          Amount
        </label>
        <div className="mt-2 flex items-center gap-2 border-b border-honey/15 pb-2 transition-colors focus-within:border-honey/60">
          <input
            className="flex-1 bg-transparent text-2xl sm:text-3xl font-light text-honey-soft outline-none placeholder:text-honey-soft/20 numeric"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setAmount(fmtToken(data.balance, 18, 6))}
            className="rounded-full border border-honey/20 px-3 py-1 text-[10px] uppercase tracking-wider2 text-honey-soft/70 hover:border-honey/50 hover:text-honey-soft transition-colors"
          >
            Max
          </button>
        </div>
      </div>

      <div className="mt-6">
        <label className="block text-[10px] uppercase tracking-wider2 text-honey-soft/50 mb-2">
          Lock duration
        </label>
        <LockTierPicker value={lock} onChange={setLock} />
      </div>

      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        disabled={!live || busy !== null || parsed === 0n}
        onClick={needsApproval ? onApprove : onStake}
        className="mt-7 w-full rounded-full bg-gradient-to-br from-honey-soft to-honey px-6 py-3 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all disabled:opacity-40 disabled:shadow-none"
      >
        {!live
          ? "Awaiting deployment"
          : needsApproval
          ? busy === "approve" ? "Approving…" : "Approve HIVE"
          : busy === "stake" ? "Entering Hive…" : "Enter Hive"}
      </motion.button>

      <p className="mt-4 text-[11px] text-honey-soft/40 text-center">
        Longer locks earn deeper share. Early exit forfeits pending nectar.
      </p>
    </div>
  );
}
