import { LOCK_TIERS } from "@/lib/addresses";

type Props = {
  value: number;
  onChange: (seconds: number) => void;
};

export function LockTierPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {LOCK_TIERS.map((t) => {
        const active = value === t.seconds;
        return (
          <button
            key={t.seconds}
            type="button"
            onClick={() => onChange(t.seconds)}
            className={`tier-btn ${active ? "tier-btn-active" : ""}`}
          >
            <div className="tier-label">{t.label}</div>
            <div className="tier-mult">{t.multiplier.toFixed(1)}x</div>
          </button>
        );
      })}
    </div>
  );
}
