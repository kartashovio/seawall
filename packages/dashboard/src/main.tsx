import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider, createNetworkConfig } from "@mysten/dapp-kit";
import "@mysten/dapp-kit/dist/index.css";
import "./styles.css";
import { App } from "./App";

const { networkConfig } = createNetworkConfig({
  testnet: { url: "https://fullnode.testnet.sui.io:443", network: "testnet" },
});
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        {/* The connect modal is populated by the Wallet Standard — dapp-kit auto-lists
            every installed wallet that advertises a Sui signing feature; we never pick
            one. Surface Slush (official Mysten wallet) first: it's the Sui-native signer
            with a real testnet switcher, which is what the live override needs. Phantom
            can also appear (it registers Sui) but its Sui support is mainnet-only, so it
            can't sign this testnet demo — preferredWallets only REORDERS, it doesn't hide. */}
        <WalletProvider preferredWallets={["Slush"]} autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
