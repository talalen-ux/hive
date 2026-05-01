import Head from "next/head";
import { ConnectButton } from "@/components/ConnectButton";
import { StakeCard } from "@/components/StakeCard";
import { PositionCard } from "@/components/PositionCard";
import { HiveStats } from "@/components/HiveStats";

export default function Home() {
  return (
    <>
      <Head>
        <title>Hive — Stake $HIVE, Earn Fees</title>
        <meta name="description" content="Stake HIVE. Enter the Hive. Earn real trading fees." />
      </Head>
      <main className="page">
        <header className="header">
          <div className="brand">🐝 HIVE</div>
          <ConnectButton />
        </header>

        <section className="hero">
          <h1>Enter the Hive.</h1>
          <p>Stake $HIVE for 24h to 7d. Earn real fees in HIVE + ETH. Longer locks, bigger share.</p>
        </section>

        <div className="grid">
          <StakeCard />
          <PositionCard />
        </div>

        <HiveStats />

        <footer className="footer">
          <a href="https://etherscan.io" target="_blank" rel="noreferrer">Etherscan</a>
          <a href="/docs/hive-system.md">How it works</a>
        </footer>
      </main>
    </>
  );
}
