import type { AppProps } from "next/app";
import Head from "next/head";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { Layout } from "@/components/Layout";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  // One QueryClient per request. Keeping it in module scope leaks cache
  // across users in SSR — this is the React Query + Next.js Pages Router
  // recommendation.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Head>
          <title>Hive — A living digital hive powered by capital</title>
          <meta
            name="description"
            content="Stake $HIVE into a living vault. Earn real fees in HIVE + ETH. Longer locks, deeper share."
          />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link
            rel="icon"
            href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpolygon points='8,2 24,2 32,16 24,30 8,30 0,16' fill='%23F5B942'/%3E%3C/svg%3E"
          />
        </Head>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
