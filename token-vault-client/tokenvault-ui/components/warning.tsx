"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const warnings = [
  ["This is a test network.", "The contract is deployed on Sepolia. Nothing here has real-world value."],
  ["Use a test or dummy account.", "Switch to a separate wallet account made only for testing. Never use your main wallet or one that holds real funds."],
  ["Never send real ETH.", "Do not send real (mainnet) ETH to this contract or its address. Only use free Sepolia test ETH, and only through the Mint button. Sending ETH directly to the contract will fail."],
  ["Protect your keys.", "No genuine site needs your seed phrase or private key. Never enter them here or anywhere else."],
  ["Check before you sign.", "Make sure your wallet shows the Sepolia network and the contract address below before you confirm anything."],
  ["This is a demo.", "The contract is a student project and has not been professionally audited."],
];

export default function Warning() {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  function proceed() {
    try { sessionStorage.setItem("jtk-ack", "1"); } catch { /* storage unavailable: gate re-appears */ }
    router.push("/lock");
  }
  return (
    <section className="rounded-2xl border border-amber-700/60 bg-zinc-900 p-6 shadow-lg" aria-labelledby="w-title">
      <p className="text-sm font-medium uppercase tracking-wide text-amber-400">Sepolia testnet only</p>
      <h1 id="w-title" className="mt-1 text-2xl font-bold text-gray-600">Read this before you continue</h1>
      <ol className="mt-5 space-y-4">
        {warnings.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm font-semibold text-amber-300">{i + 1}</span>
            <p className="text-sm text-zinc-300"><b className="text-zinc-100">{title}</b> {text}</p>
          </li>
        ))}
      </ol>
      {/* <p className="mt-5 break-all rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">Contract: <a className="text-violet-300 underline" href={explorer} target="_blank" rel="noopener noreferrer">{explorer.split("/").pop()}</a></p> */}
      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-violet-500" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>I understand this is a test network, and I am using a test account with no real funds.</span>
      </label>
      <button disabled={!ok} onClick={proceed} className="mt-5 w-full rounded-lg bg-violet-600 px-4 py-3 font-medium text-white transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-not-allowed disabled:opacity-40">Continue to the Vault page</button>
    </section>
  );
}
