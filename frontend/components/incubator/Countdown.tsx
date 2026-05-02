import { useTick } from "@/hooks/useIncubator";

type Props = {
  end: number;
  className?: string;
};

export function Countdown({ end, className }: Props) {
  useTick(1000);
  const remaining = Math.max(0, end - Date.now());
  if (remaining === 0) {
    return <span className={className}>closed</span>;
  }
  const h = Math.floor(remaining / (60 * 60 * 1000));
  const m = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  const s = Math.floor((remaining % (60 * 1000)) / 1000);
  if (h >= 1) return <span className={className}>{h}h {m}m</span>;
  if (m >= 1) return <span className={className}>{m}m {s}s</span>;
  return <span className={className}>{s}s</span>;
}
