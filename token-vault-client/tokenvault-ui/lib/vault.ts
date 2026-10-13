import { createPublicClient, http, isAddress, type Address } from "viem";
import { foundry, mainnet, sepolia } from "viem/chains";
import { abi } from "./abi";

const CHAINS = { [mainnet.id]: mainnet, [sepolia.id]: sepolia, [foundry.id]: foundry } as const;

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them.
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
const address = process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "";
const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "";

export const chain = CHAINS[chainId as keyof typeof CHAINS];

function rpcOk(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname));
  } catch { return false; }
}

export const configError: string | null = !chain
  ? "NEXT_PUBLIC_CHAIN_ID must be 1 (Ethereum), 11155111 (Sepolia) or 31337 (local)."
  : !isAddress(address, { strict: false })
    ? "NEXT_PUBLIC_VAULT_ADDRESS is missing or is not a valid address."
    : !rpcOk(rpc)
      ? "NEXT_PUBLIC_RPC_URL must be an https URL (http is allowed only for localhost)."
      : null;

export const VAULT = address as Address;
export const publicClient = configError ? null : createPublicClient({ chain, transport: http(rpc) });

export { abi };

export const ERROR_TEXT: Record<string, string> = {
  Unauthorized: "Only the vault owner can do that.",
  ZeroAmount: "The amount must be greater than 0.",
  NotEnoughBalance: "That is more than the deposit holds.",
  TimeNotReached: "This deposit has not reached its unlock date yet.",
  ZeroDate: "Choose at least 1 day.",
  DepositsPaused: "Deposits are paused by the owner. Withdrawals still work.",
  ExceedsFeeCap: "The fee is above the 10% cap.",
  ReentrancyGuardReentrantCall: "Another transaction is in progress. Wait a moment and try again.",
};
