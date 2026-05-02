import { useMemo } from "react";

type Props = {
  /** number of vertical streams */
  streams?: number;
  /** 0..1, how vivid the flow is */
  intensity?: number;
};

export function NectarFlow({ streams = 7, intensity = 0.7 }: Props) {
  const lanes = useMemo(
    () =>
      Array.from({ length: streams }, (_, i) => {
        const r = (n: number) => ((Math.sin(i * 73 + n) + 1) / 2);
        return {
          left: `${(i / (streams - 1)) * 100}%`,
          width: `${(1 + r(1) * 1.5).toFixed(2)}px`,
          delay: `${(r(2) * 4).toFixed(2)}s`,
          duration: `${(4 + r(3) * 4).toFixed(2)}s`,
          opacity: 0.3 + r(4) * 0.5 * intensity,
        };
      }),
    [streams, intensity],
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
    >
      {lanes.map((l, i) => (
        <span
          key={i}
          className="honey-stream absolute top-0 h-[160%] w-px animate-flowDown"
          style={{
            left: l.left,
            width: l.width,
            opacity: l.opacity,
            animationDelay: l.delay,
            animationDuration: l.duration,
          }}
        />
      ))}
    </div>
  );
}
