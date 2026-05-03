import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { parseUnits } from "viem";
import { useHiveActions, useStakerData } from "@/hooks/useHiveStake";
import { useTick } from "@/hooks/useIncubator";
import { fmtCountdown, fmtToken } from "@/lib/format";

/**
 * The user's stake position. Shows current stake, pending rewards,
 * partial-unstake controls, and a vote-freeze badge when one is active.
 * The freeze blocks unstake while the user has open governance votes.
 */
export function PositionCard() {
  const { address } = useAccount();
  const data = useStakerData();
  const actions = useHiveActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Re-render every second so the freeze countdown ticks down.
  useTick();

  if (!address || data.staked === 0n) return null;

  const now = Math.floor(Date.now() / 1000);
  const frozen = data.voteFreezeUntil > now;
  const freezeRemainingSec = frozen ? data.voteFreezeUntil - now : 0;

  const parsedUnstake = (() => {
    try {
      return unstakeAmount ? parseUnits(unstakeAmount, 18) : 0n;
    } catch {
      return 0n;
    }
  })();
  const validUnstake = parsedUnstake > 0n && parsedUnstake <= data.staked;

  async function onClaim() {
    if (!address) return;
    setBusy("claim");
    setError(null);
    try {
      await actions.claim(address);
      await data.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function onUnstake() {
    if (!validUnstake) return;
    setBusy("unstake");
    setError(null);
    try {
      await actions.unstake(unstakeAmount);
      setUnstakeAmount("");
      await data.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function onUnstakeAll() {
    setBusy("unstake");
    setError(null);
    try {
      await actions.unstakeAll();
      setUnstakeAmount("");
      await data.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-6 sm:p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-wider2 text-honey-soft/60">
          Your position
        </h2>
        <span className="text-[11px] text-honey-soft/45">
          weight 1× · no lock
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

      {frozen && (
        <div className="mt-4 rounded-xl border border-honey/25 bg-honey/[0.04] px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/65">
            Vote freeze active
          </div>
          <div className="mt-1 flex items-baseline justify-between text-[12px] text-honey-soft/85">
            <span>You have an open vote — unstake unlocks when it closes.</span>
            <span className="numeric ml-3 shrink-0">{fmtCountdown(freezeRemainingSec)}</span>
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Pending label="HIVE" value={fmtToken(data.pendingHive)} />
        <Pending label="ETH" value={fmtToken(data.pendingEth)} />
      </div>
      <p className="mt-2 text-[11px] text-honey-soft/40">
        Rewards accrue when projects launch. No continuous yield to time.
      </p>

      <div className="mt-6 flex items-center gap-2 border-b border-honey/15 pb-2">
        <input
          className="flex-1 bg-transparent text-lg font-light text-honey-soft outline-none placeholder:text-honey-soft/20 numeric"
          inputMode="decimal"
          placeholder="Unstake amount"
          value={unstakeAmount}
          onChange={(e) => setUnstakeAmount(e.target.value)}
          disabled={frozen}
        />
        <button
          type="button"
          onClick={() => setUnstakeAmount(fmtToken(data.staked, 18, 6))}
          disabled={frozen}
          className="rounded-full border border-honey/20 px-3 py-1 text-[10px] uppercase tracking-wider2 text-honey-soft/70 hover:border-honey/50 hover:text-honey-soft transition-colors disabled:opacity-40"
        >
          Max
        </button>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          disabled={busy !== null || (data.pendingHive === 0n && data.pendingEth === 0n)}
          onClick={onClaim}
          className="flex-1 rounded-full bg-gradient-to-br from-honey-soft to-honey px-5 py-2.5 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all disabled:opacity-40 disabled:shadow-none"
        >
          {busy === "claim" ? "Claiming…" : "Claim"}
        </motion.button>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          disabled={busy !== null || frozen || !validUnstake}
          onClick={onUnstake}
          title={frozen ? "Vote freeze active" : "Unstake the entered amount"}
          className="flex-1 rounded-full border border-honey/15 px-5 py-2.5 text-[12px] tracking-wider2 uppercase text-honey-soft/75 hover:border-honey/40 hover:text-honey-soft transition-all disabled:opacity-40"
        >
          {busy === "unstake" ? "Unstaking…" : "Unstake"}
        </motion.button>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          disabled={busy !== null || frozen}
          onClick={onUnstakeAll}
          title={frozen ? "Vote freeze active" : "Exit the full position"}
          className="rounded-full border border-honey/10 px-4 py-2.5 text-[12px] tracking-wider2 uppercase text-honey-soft/55 hover:border-honey/30 hover:text-honey-soft/85 transition-all disabled:opacity-40"
        >
          {busy === "unstake" ? "…" : "Exit all"}
        </motion.button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-400/30 bg-red-400/[0.04] px-3 py-2 text-[11px] text-red-300/80">
          {error.length > 200 ? `${error.slice(0, 200)}…` : error}
        </div>
      )}
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
