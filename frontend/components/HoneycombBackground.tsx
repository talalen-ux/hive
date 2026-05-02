export function HoneycombBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-ink" />
      <div className="absolute -inset-[10%] honeycomb-bg animate-drift opacity-80" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_30%,rgba(245,185,66,0.10),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(40%_30%_at_80%_90%,rgba(255,204,102,0.06),transparent_70%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink/90" />
    </div>
  );
}
