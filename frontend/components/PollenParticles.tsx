import { useMemo } from "react";

type Particle = {
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
};

export function PollenParticles({ count = 18 }: { count?: number }) {
  const particles = useMemo<Particle[]>(() => {
    // deterministic seed so SSR and client render the same coords
    return Array.from({ length: count }, (_, i) => {
      const r = (n: number) => ((Math.sin(i * 9301 + n) + 1) / 2);
      return {
        left: `${(r(1) * 100).toFixed(2)}%`,
        top: `${(r(2) * 100).toFixed(2)}%`,
        size: 1 + r(3) * 2,
        delay: `${(r(4) * 8).toFixed(2)}s`,
        duration: `${(8 + r(5) * 8).toFixed(2)}s`,
      };
    });
  }, [count]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-[5] overflow-hidden">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-honey-glow blur-[1px] animate-pollen"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
            boxShadow: "0 0 8px rgba(255, 215, 106, 0.7)",
          }}
        />
      ))}
    </div>
  );
}
