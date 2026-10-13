"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BaseError, ContractFunctionRevertedError, createWalletClient, custom, formatEther,
  getAddress, parseEther, type Address, type EIP1193Provider, type Hex, type WalletClient,
} from "viem";
import { abi, chain, configError, ERROR_TEXT, publicClient, VAULT } from "@/lib/vault";

declare global { interface Window { ethereum?: EIP1193Provider } }

type Dep = { id: bigint; amount: bigint; time: bigint };
type Stats = { tvl: bigint; fee: bigint; cap: bigint; owner: Address; profit: bigint };
type Note = { ok: boolean; text: string };

const MAX_DAYS = 3650;
const eth = (v: bigint) => `${formatEther(v)} ETH`;
const when = (t: bigint) => new Date(Number(t) * 1000).toLocaleString();

function friendly(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError && r.data?.errorName)
      return ERROR_TEXT[r.data.errorName] ?? "The contract rejected this action.";
    if (e.name === "UserRejectedRequestError" || e.shortMessage.includes("User rejected")) return "You cancelled the request in your wallet.";
    return e.shortMessage;
  }
  return "Something went wrong. Please try again.";
}

const btn = "rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
const primary = `${btn} bg-emerald-700 text-white hover:bg-emerald-800`;
const plain = `${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
const warn = `${btn} border border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100`;
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-700";
const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

export default function Vault() {
  const [account, setAccount] = useState<Address | null>(null);
  const [rightChain, setRightChain] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [deps, setDeps] = useState<Dep[]>([]);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [amt, setAmt] = useState("");
  const [days, setDays] = useState("30");
  const [wd, setWd] = useState<{ dep: Dep; value: string } | null>(null);
  const [exit, setExit] = useState<Dep | null>(null);
  const [newFee, setNewFee] = useState("");

  const refresh = useCallback(async (acct: Address | null) => {
    if (!publicClient) return;
    const c = { address: VAULT, abi } as const;
    const [tvl, fee, cap, owner, profit] = await Promise.all([
      publicClient.readContract({ ...c, functionName: "totalDeposits" }),
      publicClient.readContract({ ...c, functionName: "FEE_BPS" }),
      publicClient.readContract({ ...c, functionName: "MAX_FEE_BPS" }),
      publicClient.readContract({ ...c, functionName: "owner" }),
      publicClient.readContract({ ...c, functionName: "totalOwnersProfit" }),
    ]);
    setStats({ tvl, fee, cap, owner, profit });
    if (acct) {
      const [ids, infos] = await publicClient.readContract({ ...c, functionName: "getDepositsOf", args: [acct] });
      setDeps(ids.map((id, i) => ({ id, amount: infos[i].amount, time: infos[i].time })));
    } else setDeps([]);
  }, []);

  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    refresh(null).catch(() => setNote({ ok: false, text: "Could not read the vault. Check the RPC URL and contract address." }));
    const p = window.ethereum;
    if (!p) return () => clearInterval(t);
    const onAccounts = (a: Address[]) => { const x = a[0] ? getAddress(a[0]) : null; setAccount(x); refresh(x).catch(() => {}); };
    const onChain = () => window.location.reload();
    p.on("accountsChanged", onAccounts);
    p.on("chainChanged", onChain);
    return () => { clearInterval(t); p.removeListener("accountsChanged", onAccounts); p.removeListener("chainChanged", onChain); };
  }, [refresh]);

  const isOwner = !!account && !!stats && account.toLowerCase() === stats.owner.toLowerCase();

  async function connect() {
    const p = window.ethereum;
    if (!p) return setNote({ ok: false, text: "No wallet found. Install a browser wallet such as MetaMask." });
    try {
      const w = createWalletClient({ chain, transport: custom(p) });
      const [a] = await w.requestAddresses();
      const id = Number(BigInt(await p.request({ method: "eth_chainId" })));
      setRightChain(id === chain.id);
      setAccount(a);
      await refresh(a);
    } catch (e) { setNote({ ok: false, text: friendly(e) }); }
  }

  async function switchNetwork() {
    try { await createWalletClient({ chain, transport: custom(window.ethereum!) }).switchChain({ id: chain.id }); setRightChain(true); }
    catch (e) { setNote({ ok: false, text: friendly(e) }); }
  }

  // Simulates first (so reverts surface as readable errors), then asks the wallet to sign.
  function act(done: string, fn: (a: Address, w: WalletClient) => Promise<Hex>, after?: () => void) {
    return async () => {
      if (!account || !window.ethereum || !publicClient) return;
      setBusy(true); setNote(null);
      try {
        const w = createWalletClient({ account, chain, transport: custom(window.ethereum) });
        const hash = await fn(account, w);
        const r = await publicClient.waitForTransactionReceipt({ hash });
        if (r.status !== "success") throw new Error("reverted");
        setNote({ ok: true, text: done });
        after?.();
        await refresh(account);
      } catch (e) { setNote({ ok: false, text: friendly(e) }); }
      finally { setBusy(false); }
    };
  }

  const sim = publicClient!;
  const doDeposit = () => {
    if (!/^\d+(\.\d{1,18})?$/.test(amt) || parseEther(amt) === 0n) return setNote({ ok: false, text: "Enter an ETH amount greater than 0." });
    if (!/^\d+$/.test(days) || +days < 1 || +days > MAX_DAYS) return setNote({ ok: false, text: `Choose between 1 and ${MAX_DAYS} days.` });
    const value = parseEther(amt), d = BigInt(days);
    return act("Deposit locked.", async (a, w) => {
      const { request } = await sim.simulateContract({ address: VAULT, abi, account: a, functionName: "deposit", args: [d], value });
      return w.writeContract(request);
    }, () => setAmt(""))();
  };
  const doWithdraw = () => {
    if (!wd) return;
    if (!/^\d+(\.\d{1,18})?$/.test(wd.value) || parseEther(wd.value) === 0n || parseEther(wd.value) > wd.dep.amount)
      return setNote({ ok: false, text: "Enter an amount between 0 and the deposit balance." });
    const v = parseEther(wd.value), id = wd.dep.id;
    return act("Withdrawal complete.", async (a, w) => {
      const { request } = await sim.simulateContract({ address: VAULT, abi, account: a, functionName: "withdraw", args: [v, id] });
      return w.writeContract(request);
    }, () => setWd(null))();
  };
  const doExit = (id: bigint) => act("Deposit closed early.", async (a, w) => {
    const { request } = await sim.simulateContract({ address: VAULT, abi, account: a, functionName: "emergencyWithdrawal", args: [id] });
    return w.writeContract(request);
  }, () => setExit(null))();
  const ownerCall = (fn: "withdrawOwnersProfit" | "pauseDeposits", done: string) => act(done, async (a, w) => {
    const { request } = await sim.simulateContract({ address: VAULT, abi, account: a, functionName: fn });
    return w.writeContract(request);
  })();
  const doFee = () => {
    if (!stats || !/^\d+$/.test(newFee) || BigInt(newFee) > stats.cap) return setNote({ ok: false, text: `Enter a whole number from 0 to ${stats?.cap ?? 1000n}.` });
    const f = BigInt(newFee);
    return act("Fee updated.", async (a, w) => {
      const { request } = await sim.simulateContract({ address: VAULT, abi, account: a, functionName: "changeFee", args: [f] });
      return w.writeContract(request);
    }, () => setNewFee(""))();
  };

  if (configError) return <div role="alert" className={`${card} border-amber-300 bg-amber-50 text-amber-900`}><b>Setup needed.</b> {configError} See README.md.</div>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">TokenVault</h1>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600">{chain.name}</span>
          {account ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">{account.slice(0, 6)}…{account.slice(-4)}</span>
            : <button className={primary} onClick={connect}>Connect wallet</button>}
        </div>
      </header>

      {note && <p role="status" className={`rounded-lg px-4 py-2 text-sm ${note.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{note.text}</p>}
      {account && !rightChain && <div role="alert" className={`${card} flex items-center justify-between gap-3 border-amber-300 bg-amber-50`}><span className="text-sm">Your wallet is on the wrong network.</span><button className={warn} onClick={switchNetwork}>Switch to {chain.name}</button></div>}

      <section className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 text-center shadow-sm" aria-label="Vault totals">
        {[["Total locked", stats ? eth(stats.tvl) : "…"], ["Early exit fee", stats ? `${Number(stats.fee) / 100}%` : "…"], ["Fee cap", stats ? `${Number(stats.cap) / 100}%` : "…"]].map(([k, v]) => (
          <div key={k} className="p-4"><div className="text-lg font-semibold sm:text-2xl">{v}</div><div className="text-xs text-slate-500">{k}</div></div>
        ))}
      </section>

      {!account ? <div className={`${card} text-center text-slate-600`}>Connect your wallet to lock ETH and manage deposits.</div> : (
        <>
          {isOwner && (
            <section className={card} aria-label="Owner controls">
              <h2 className="mb-3 font-semibold">Owner controls</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <div><p className="text-sm text-slate-500">Fees collected</p><p className="mb-2 text-xl font-semibold">{stats ? eth(stats.profit) : "…"}</p>
                  <button className={primary} disabled={busy || !stats?.profit} onClick={() => ownerCall("withdrawOwnersProfit", "Fees withdrawn.")}>Withdraw fees</button></div>
                <div className="space-y-3">
                  <div><button className={plain} disabled={busy} onClick={() => ownerCall("pauseDeposits", "Pause setting toggled.")}>Pause or resume deposits</button>
                    <p className="mt-1 text-xs text-slate-500">The contract does not expose its paused state, so this toggles it.</p></div>
                  <div><label htmlFor="fee" className="text-sm text-slate-600">New early exit fee (basis points, max {String(stats?.cap ?? 1000)})</label>
                    <div className="mt-1 flex gap-2"><input id="fee" inputMode="numeric" className={input} value={newFee} onChange={(e) => setNewFee(e.target.value)} /><button className={plain} disabled={busy} onClick={doFee}>Update</button></div></div>
                </div>
              </div>
            </section>
          )}

          <div className="grid gap-5 md:grid-cols-5">
            <section className={`${card} md:col-span-2`}>
              <h2 className="mb-2 font-semibold">Lock ETH</h2>
              <label htmlFor="amt" className="text-sm text-slate-600">Amount (ETH)</label>
              <input id="amt" inputMode="decimal" className={`${input} mb-3`} placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value)} />
              <label htmlFor="days" className="text-sm text-slate-600">Lock for (days)</label>
              <input id="days" inputMode="numeric" className={input} value={days} onChange={(e) => setDays(e.target.value)} />
              <div className="my-2 flex flex-wrap gap-2">{[7, 30, 90, 365].map((d) => <button key={d} className={`${plain} px-3 py-1`} onClick={() => setDays(String(d))}>{d}d</button>)}</div>
              {/^\d+$/.test(days) && +days > 0 && +days <= MAX_DAYS && now > 0 && <p className="mb-3 text-xs text-slate-500">Unlocks on {when(BigInt(now + +days * 86400))}</p>}
              <button className={`${primary} w-full`} disabled={busy || !rightChain} onClick={doDeposit}>{busy ? "Waiting for confirmation…" : "Lock ETH"}</button>
              <p className="mt-2 text-xs text-slate-500">Withdraw in full after the unlock date at no cost. Leaving early costs {stats ? Number(stats.fee) / 100 : "…"}%.</p>
            </section>

            <section className={`${card} md:col-span-3`}>
              <h2 className="mb-2 font-semibold">Your deposits</h2>
              {deps.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No active deposits. Lock some ETH to get started.</p> : (
                <ul className="divide-y divide-slate-200">
                  {deps.map((d) => { const open = now >= Number(d.time); return (
                    <li key={String(d.id)} className="py-3">
                      <div className="flex items-baseline justify-between gap-2"><span className="text-lg font-semibold">{eth(d.amount)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${open ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{open ? "Unlocked" : "Locked"}</span></div>
                      <p className="text-xs text-slate-500">Deposit #{String(d.id)}. {open ? "Unlocked" : "Unlocks"} {when(d.time)}</p>
                      <div className="mt-2 flex gap-2">
                        <button className={primary} disabled={busy || !open || !rightChain} title={open ? undefined : "Available after the unlock date"} onClick={() => setWd({ dep: d, value: formatEther(d.amount) })}>Withdraw</button>
                        <button className={warn} disabled={busy || !rightChain} onClick={() => setExit(d)}>Exit early</button>
                      </div>
                    </li>); })}
                </ul>
              )}
              {wd && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4" role="group" aria-label="Withdraw">
                  <label htmlFor="wv" className="text-sm text-slate-600">Withdraw from #{String(wd.dep.id)} (ETH)</label>
                  <input id="wv" inputMode="decimal" className={`${input} my-2`} value={wd.value} onChange={(e) => setWd({ ...wd, value: e.target.value })} />
                  <div className="flex gap-2"><button className={primary} disabled={busy} onClick={doWithdraw}>Confirm withdrawal</button><button className={plain} onClick={() => setWd(null)}>Cancel</button></div>
                </div>
              )}
              {exit && stats && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4" role="alertdialog" aria-label="Confirm early exit">
                  <p className="text-sm text-amber-900">Closing deposit #{String(exit.id)} early sends you <b>{eth(exit.amount - (exit.amount * stats.fee) / 10000n)}</b>. A fee of {eth((exit.amount * stats.fee) / 10000n)} goes to the vault owner.</p>
                  <div className="mt-3 flex gap-2"><button className={warn} disabled={busy} onClick={() => doExit(exit.id)}>Exit and pay fee</button><button className={plain} onClick={() => setExit(null)}>Keep locked</button></div>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
