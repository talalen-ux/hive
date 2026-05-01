import { formatUnits } from "viem";

export function fmtToken(value: bigint, decimals = 18, frac = 4): string {
  const s = formatUnits(value, decimals);
  const [whole, dec = ""] = s.split(".");
  const trimmed = dec.slice(0, frac).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function fmtCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return "Unlocked";
  const d = Math.floor(secondsLeft / 86400);
  const h = Math.floor((secondsLeft % 86400) / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
