import { useStakerData } from "@/hooks/useHiveStake";
import { fmtToken } from "@/lib/format";

export function HiveStats() {
  const data = useStakerData();
  return (
    <div className="card stats">
      <div>
        <div className="stat-label">Total Staked</div>
        <div className="stat-value">{fmtToken(data.totalStaked)} HIVE</div>
      </div>
      <div>
        <div className="stat-label">Weighted Stake</div>
        <div className="stat-value">{fmtToken(data.totalWeighted)}</div>
      </div>
    </div>
  );
}
