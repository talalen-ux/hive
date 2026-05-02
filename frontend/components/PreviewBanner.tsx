import { useChainId } from "wagmi";
import { motion } from "framer-motion";
import { isLiveOn } from "@/lib/addresses";

export function PreviewBanner() {
  const chainId = useChainId();
  if (isLiveOn(chainId)) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.5 }}
      className="relative z-10 mx-auto mt-2 flex max-w-6xl items-center justify-center gap-2 px-6"
      role="status"
    >
      <span className="rounded-full border border-honey/25 bg-honey/[0.05] px-3 py-1 text-[10px] uppercase tracking-wider2 text-honey-soft/75">
        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-honey-glow animate-pulse align-middle" />
        Preview · contracts not yet deployed on this chain
      </span>
    </motion.div>
  );
}
