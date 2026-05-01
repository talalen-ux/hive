import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button className="btn-ghost" onClick={() => disconnect()}>
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
  return (
    <button className="btn-primary" disabled={isPending || !injected} onClick={() => injected && connect({ connector: injected })}>
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
