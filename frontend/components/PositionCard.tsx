import { useState } from "react";
import { useAccount } from "wagmi";
import { useHiveActions, useStakerData } from "@/hooks/useHiveStake";
import { useCountdown } from "@/hooks/useCountdown";
import { fmtCountdown, fmtToken } from "@/lib/format";

const MULT_BY_DURATION: Record<number, string> = {
  86400: "1.0x",
  259200: "1.2x",
  604800: "1.5x",
};

export function PositionCard() {
  const { address } = useAccount();
  const data = useStakerData();
  const actions = useHiveActions();
  const remaining = useCountdown(data.lockEnd);
  const [busy, setBusy] = useState<string | null>(null);

  if (!address || data.staked === 0n) return null;

  const unlocked = remaining === 0;

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
    <div className="card">
      <h2 className="card-title">Your Position</h2>
      <div className="row"><span>Staked</span><span>{fmtToken(data.staked)} HIVE</span></div>
      <div className="row"><span>Multiplier</span><span>{MULT_BY_DURATION[data.lockDuration] ?? "1.0x"}</span></div>
      <div className="row"><span>Unlock in</span><span>{fmtCountdown(remaining)}</span></div>

      <h3 className="card-sub" style={{ marginTop: 16 }}>Pending rewards</h3>
      <div className="row"><span>HIVE</span><span>{fmtToken(data.pendingHive)}</span></div>
      <div className="row"><span>ETH</span><span>{fmtToken(data.pendingEth)}</span></div>

      <div className="actions">
        <button
          className="btn-primary"
          disabled={!unlocked || busy !== null || (data.pendingHive === 0n && data.pendingEth === 0n)}
          onClick={onClaim}
        >
          {busy === "claim" ? "Claiming…" : unlocked ? "Claim" : "Locked"}
        </button>
        <button
          className="btn-secondary"
          disabled={busy !== null}
          onClick={onUnstake}
          title={unlocked ? "Unstake and claim" : "Unstaking before unlock forfeits rewards"}
        >
          {busy === "unstake" ? "Unstaking…" : unlocked ? "Unstake" : "Unstake (forfeit rewards)"}
        </button>
      </div>
    </div>
  );
}
