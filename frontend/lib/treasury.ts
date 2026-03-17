"use server";

import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

function getNgoPrivateKey() {
  const privateKey = process.env.NGO_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("NGO_PRIVATE_KEY is missing.");
  }

  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
}

const account = privateKeyToAccount(getNgoPrivateKey());

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

export const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(),
});

export async function disburseSessionPayment(therapistAddress: `0x${string}`) {
  const hash = await walletClient.sendTransaction({
    account,
    chain: sepolia,
    to: therapistAddress,
    value: parseEther("0.00475"),
  });

  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}
