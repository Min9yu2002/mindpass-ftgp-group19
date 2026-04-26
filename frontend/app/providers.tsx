"use client";

import "@rainbow-me/rainbowkit/styles.css";

import type { ReactNode } from "react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { ThemeProvider } from "next-themes";
import { WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
import LiquidBackground from "../components/LiquidBackground";

type ProvidersProps = {
  children: ReactNode;
};

const config = getDefaultConfig({
  appName: "MindPass",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  chains: [sepolia],
  ssr: false,
});

export default function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider attribute="class" defaultTheme="system">
      <LiquidBackground />
      <div className="app-shell-root">
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider>{children}</RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </div>
    </ThemeProvider>
  );
}
