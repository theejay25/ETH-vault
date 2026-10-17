# TokenVault UI

A Next.js frontend for the `TokenVault` Solidity contract: a time-locked ETH vault where users lock ETH for a chosen number of days, withdraw after the unlock date, or exit early for a fee. The vault owner gets a separate panel for fees, pausing deposits and changing the fee.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, viem 2, TypeScript. Versions are pinned exactly in `package.json` and locked in `package-lock.json`. No wallet SDKs or UI kits are used, which keeps the dependency tree small. The wallet connects through the browser's injected provider (`window.ethereum`, for example MetaMask).

## Requirements

Node.js 20.9 or newer and npm 10 or newer.

## Setup

```bash
npm ci
cp .env.example .env.local
# edit .env.local with your deployed contract details
npm run dev
```

Open http://localhost:3000.

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_CHAIN_ID` | `1` (Ethereum), `11155111` (Sepolia) or `31337` (local Anvil or Hardhat) |
| `NEXT_PUBLIC_VAULT_ADDRESS` | Address of the deployed `TokenVault` |
| `NEXT_PUBLIC_RPC_URL` | JSON-RPC endpoint used for reads. Must be `https`, or `http` for localhost only |

These values are public by design because they ship in the browser bundle. Never put private keys or secret API keys in them. If your RPC provider issues a key, use a provider that lets you restrict keys by domain, or proxy the RPC through your own server. To support another network, add its chain to the `CHAINS` map in `lib/vault.ts`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` then `npm start` | Production build and server |
| `npm run typecheck` | TypeScript check |
| `npm run audit:prod` | Audit runtime dependencies only |

## How it works

- Reads (totals, fee, owner) use a read-only client, so the stats show before a wallet connects.
- Your deposits come from `getDepositsOf(address)`, which returns active deposits only.
- Every write is simulated first with `simulateContract`. Reverts are decoded from the contract's custom errors and shown as plain messages before anything reaches the wallet.
- The owner panel appears when the connected address equals `owner()`.

## Security measures

- **Content Security Policy with a per-request nonce** (`proxy.ts`): scripts and styles run only with the nonce, `object-src 'none'`, `frame-ancestors 'none'`, and `connect-src` limited to the app and your RPC origin.
- **Security headers** (`next.config.ts`): HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy`, `Permissions-Policy`. The `X-Powered-By` header is disabled.
- **Configuration validation**: the contract address, chain ID and RPC URL are validated at startup. The page shows a setup message instead of running with bad values.
- **Input validation**: ETH amounts must match a strict decimal pattern (up to 18 places) and are parsed with `parseEther`. Days must be a whole number from 1 to 3650. Fee input must be a whole number within the contract's cap.
- **Wrong-network guard**: write buttons are disabled until the wallet is on the configured chain, with a one-click switch.
- **No unsafe rendering**: no `dangerouslySetInnerHTML`, no `eval`, no URL values from users. All wallet and chain text is rendered as escaped text.
- **No secrets, no key handling**: the app never sees private keys. Signing happens only in the user's wallet.
- **Explicit confirmation for early exit**: the fee and the amount received are shown before the transaction is requested.

### Limits to be aware of

- Hiding the owner panel is a convenience only. Access control is enforced by the contract's `onlyOwner` modifier.
- A frontend cannot protect users from a malicious or buggy contract. Have the contract audited and verified on a block explorer before real funds are used, and double-check `NEXT_PUBLIC_VAULT_ADDRESS`.
- Users should confirm the details shown in their wallet before signing.

## Dependency hygiene and audits

The lockfile is committed and the install currently reports 0 vulnerabilities. To keep it that way:

1. Install with `npm ci` so exact locked versions are used.
2. Run `npm audit` regularly, and before every release run `npm run audit:prod`.
3. Enable Dependabot or Renovate to receive update pull requests.
4. When updating, change versions deliberately, then re-run `npm run typecheck`, `npm run build` and `npm audit`.

## Contract notes that affect the UI

- `pauseSwitch` is `internal`, so the paused state cannot be read. The UI shows a clear message when a deposit is rejected for that reason, and the owner button toggles the state. Making the variable `public` would allow a proper status badge.
- The `feeChanged` event emits `FEE_BPS / 10000`, which is always 0. The UI reads `FEE_BPS` directly instead.
- `emergencyWithdrawn` does not log the amount or deposit ID, so activity history for early exits cannot be built from events alone.

## Deployment

The app needs a Node server runtime because the nonce-based CSP is generated per request in `proxy.ts`. It cannot be deployed as a static export. Serve it over HTTPS (HSTS is enabled), for example on Vercel or a Node host behind a TLS proxy. Set the three environment variables in your host's settings before building, since `NEXT_PUBLIC_*` values are inlined at build time.

## Project structure

```
app/layout.tsx, page.tsx, globals.css   Layout, page, Tailwind entry
components/Vault.tsx                    Wallet, reads, writes, UI
lib/abi.ts                              Contract ABI (paste the Remix JSON here after redeploying)
lib/vault.ts                            Config validation, read client, error messages
proxy.ts                                CSP with nonce
next.config.ts                          Security headers
```

## Troubleshooting

- "Setup needed" banner: one of the three environment variables is missing or invalid.
- Stats show "…" or an error: the RPC URL or contract address is wrong for the chosen chain.
- Changed `.env.local` but nothing happened: restart the dev server or rebuild.
