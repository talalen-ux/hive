import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { motion } from "framer-motion";
import { useHiveActions, useHiveContext, useStakerData } from "@/hooks/useHiveStake";
import { fmtToken } from "@/lib/format";

type Props = {
  onActivity?: (kind: "approving" | "staking" | "idle") => void;
};

/**
 * Deposit-only "Enter the hive" card. No locks, no tiers — staking is just
 * the entry ticket to participate. Withdrawal lives in PositionCard.
 */
export function StakeCard({ onActivity }: Props) {
  const { address } = useAccount();
  const { live } = useHiveContext();
  const data = useStakerData();
  const actions = useHiveActions();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    try { return amount ? parseUnits(amount, 18) : 0n; } catch { return 0n; }
  }, [amount]);

  const needsApproval = parsed > 0n && parsed > data.allowance;

  async function onApprove() {
    setBusy("approve");
    setError(null);
    onActivity?.("approving");
    try {
      await actions.approve(amount);
      await data.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      onActivity?.("idle");
    }
  }
  async function onStake() {
    setBusy("stake");
    setError(null);
    onActivity?.("staking");
    try {
      await actions.stake(amount);
      setAmount("");
      await data.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
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

      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        disabled={!live || busy !== null || parsed === 0n}
        onClick={needsApproval ? onApprove : onStake}
        className="mt-6 w-full rounded-full bg-gradient-to-br from-honey-soft to-honey px-6 py-3 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all disabled:opacity-40 disabled:shadow-none"
      >
        {!live
          ? "Awaiting deployment"
          : needsApproval
          ? busy === "approve" ? "Approving…" : "Approve HIVE"
          : busy === "stake" ? "Entering Hive…" : "Enter Hive"}
      </motion.button>

      <p className="mt-4 text-[11px] text-honey-soft/40 text-center">
        Stake is your entry ticket — vote, propose, exit anytime. Rewards land
        when projects launch.
      </p>

      {error && (
        <div className="mt-3 rounded-lg border border-red-400/30 bg-red-400/[0.04] px-3 py-2 text-[11px] text-red-300/80">
          {error.length > 160 ? `${error.slice(0, 160)}…` : error}
        </div>
      )}
    </div>
  );
}
