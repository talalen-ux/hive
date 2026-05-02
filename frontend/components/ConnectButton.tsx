import { useAccount, useConnect, useDisconnect } from "wagmi";
import { motion } from "framer-motion";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => disconnect()}
        className="rounded-full border border-honey/25 bg-honey/[0.04] px-4 py-2 text-[12px] tracking-wider2 text-honey-soft hover:border-honey/50 hover:shadow-honey transition-all numeric"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </motion.button>
    );
  }

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      disabled={isPending || !injected}
      onClick={() => injected && connect({ connector: injected })}
      className="rounded-full bg-gradient-to-br from-honey-soft to-honey px-5 py-2 text-[12px] font-medium tracking-wider2 uppercase text-ink shadow-honey hover:shadow-honeyStrong transition-all disabled:opacity-50"
    >
      {isPending ? "Connecting…" : "Connect"}
    </motion.button>
  );
}
