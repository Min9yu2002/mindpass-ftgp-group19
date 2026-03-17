"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

type WalletConnectButtonProps = {
  connectLabel?: string;
  wrongNetworkLabel?: string;
};

export default function WalletConnectButton({
  connectLabel = "Connect Wallet",
  wrongNetworkLabel = "Wrong Network",
}: WalletConnectButtonProps) {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        authenticationStatus,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        const primaryClassName =
          "button-primary rounded-full px-4 py-2 text-sm font-medium flex-shrink-0";
        const wrongNetworkClassName =
          "rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600 flex-shrink-0";

        if (!connected) {
          return (
            <div
              aria-hidden={!ready}
              className={!ready ? "pointer-events-none opacity-0 select-none" : ""}
            >
              <button
                type="button"
                onClick={openConnectModal}
                className={primaryClassName}
              >
                {connectLabel}
              </button>
            </div>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className={wrongNetworkClassName}
            >
              {wrongNetworkLabel}
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={openAccountModal}
            className={primaryClassName}
          >
            {account.displayName ?? account.displayBalance ?? "Wallet Connected"}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
