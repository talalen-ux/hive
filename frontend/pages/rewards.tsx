import { useState } from "react";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { formatUnits } from "viem";
import { CountUp } from "@/components/CountUp";
import { NectarFlow } from "@/components/NectarFlow";
import { useHiveActions, useStakerData } from "@/hooks/useHiveStake";

export default function RewardsPage() {
  const { address } = useAccount();
  const data = useStakerData();
  const actions = useHiveActions();
  // No more lock — anyone with a positive stake can claim whenever the
  // multisig has released a launch payout into the accumulator.
  const claimable = data.staked > 0n;
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(false);

  const pendingHive = num(data.pendingHive);
  const pendingEth = num(data.pendingEth);
  const intensity = Math.min(1, 0.3 + (pendingHive + pendingEth * 1000) / 10);

  async function onClaim() {
    if (!address) return;
    setBusy(true);
    try {
      await actions.claim(address);
      setBurst(true);
      setTimeout(() => setBurst(false), 1200);
      await data.refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-6 sm:pt-12">
      <header className="text-center">
        <p className="text-[11px] uppercase tracking-wider2 text-honey-soft/55">
          The hive flows
        </p>
        <h1 className="mt-3 text-3xl sm:text-5xl font-light tracking-tight text-gradient-honey">
          Nectar Flow
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-honey-soft/55">
          Real fees streaming back to those who hold the longest.
        </p>
      </header>

      <div className="relative mt-12 mx-auto max-w-3xl">
        <div className="relative overflow-hidden rounded-2xl glass-panel p-8 sm:p-12">
          <NectarFlow intensity={intensity} />

          <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-8">
            <RewardTile label="Pending HIVE" value={pendingHive} decimals={4} />
            <RewardTile label="Pending ETH" value={pendingEth} decimals={6} />
          </div>

          <div className="relative mt-10 flex flex-col items-center gap-3">
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              disabled={!claimable || busy || (pendingHive === 0 && pendingEth === 0)}
              onClick={onClaim}
              className="relative inline-flex items-center gap-3 rounded-full bg-gradient-to-br from-honey-soft to-honey px-8 py-3 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? "Streaming…" : "Claim Nectar"}
              <span aria-hidden>↳</span>

              <AnimatePresence>
                {burst && (
                  <motion.span
                    key="burst"
                    initial={{ opacity: 0.7, scale: 0.6 }}
                    animate={{ opacity: 0, scale: 2.4 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                    className="pointer-events-none absolute inset-0 rounded-full bg-honey-glow"
                  />
                )}
              </AnimatePresence>
            </motion.button>

            <div className="text-[11px] uppercase tracking-wider2 text-honey-soft/45 numeric">
              {!address
                ? "Connect a wallet"
                : data.staked === 0n
                ? "No active stake"
                : pendingHive === 0 && pendingEth === 0
                ? "Nothing to claim yet"
                : "Ready to claim"}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-honey-soft/40">
          Nectar lands when projects launch. Stay staked through a launch and
          your share is yours to claim — there's no lock to wait out.
        </p>
      </div>
    </div>
  );
}

function RewardTile({
  label,
  value,
  decimals,
}: {
  label: string;
  value: number;
  decimals: number;
}) {
  return (
    <div className="rounded-xl border border-honey/10 bg-ink/40 px-6 py-5 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-wider2 text-honey-soft/55">
        {label}
      </div>
      <div className="mt-2 text-3xl sm:text-4xl font-light text-honey-soft">
        <CountUp value={value} decimals={decimals} />
      </div>
    </div>
  );
}

function num(v: bigint, decimals = 18): number {
  const s = formatUnits(v, decimals);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
