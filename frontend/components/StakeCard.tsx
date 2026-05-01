import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { LockTierPicker } from "./LockTierPicker";
import { useHiveActions, useStakerData } from "@/hooks/useHiveStake";
import { fmtToken } from "@/lib/format";

export function StakeCard() {
  const { address } = useAccount();
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
    try { await actions.approve(amount); await data.refetch(); } finally { setBusy(null); }
  }
  async function onStake() {
    setBusy("stake");
    try { await actions.stake(amount, lock); setAmount(""); await data.refetch(); } finally { setBusy(null); }
  }

  if (!address) {
    return <div className="card">Connect a wallet to stake $HIVE.</div>;
  }

  return (
    <div className="card">
      <h2 className="card-title">Enter the Hive</h2>
      <p className="card-sub">Wallet: {fmtToken(data.balance)} HIVE</p>

      <label className="label">Amount</label>
      <div className="input-row">
        <input
          className="input"
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setAmount(fmtToken(data.balance, 18, 6))}
        >
          MAX
        </button>
      </div>

      <label className="label">Lock duration</label>
      <LockTierPicker value={lock} onChange={setLock} />

      <div className="actions">
        {needsApproval ? (
          <button className="btn-primary" disabled={busy !== null || parsed === 0n} onClick={onApprove}>
            {busy === "approve" ? "Approving…" : "Approve HIVE"}
          </button>
        ) : (
          <button className="btn-primary" disabled={busy !== null || parsed === 0n} onClick={onStake}>
            {busy === "stake" ? "Staking…" : "Stake"}
          </button>
        )}
      </div>
    </div>
  );
}
