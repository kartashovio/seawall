# Toolchain & the v1/v2 split (Step 0)

Reproducible, pinned toolchain for Seawall. **Re-verify the volatile rows on
deploy day** (see the checklist at the bottom). All versions below were verified
live on **2026-06-12**.

## Installed on this VPS

| Tool | Version | How |
|---|---|---|
| Node | **24.16.0** | via `n` (was v22). `pyth-sui-js@3.0.0` engines require `^24`. |
| pnpm | **11.5.2** | corepack. `packageManager` pinned in root `package.json`. |
| npm | 11.13.0 | bundled |
| sui CLI | **1.73.1-ff1fe0ec4551** | prebuilt tarball `sui-testnet-v1.73.1-ubuntu-x86_64.tgz` → `/usr/local/bin/sui` (**not** `suiup`). |
| git | 2.43.0 | system |

On the framework rev: the **CLI** is the `testnet-v1.73.1` tag of `MystenLabs/sui`
= commit `ff1fe0ec455153…` (matches `sui --version`, verified via `git ls-remote`).
The **Move framework package** the guardian compiles against is resolved
*transitively* through Pyth/deepbook, and `Move.lock` pins it at a **different**
commit (`718ae563…` / `041c5f2b…` for the two sub-packages) — these are framework
*source* commits, not the CLI build commit, so they are NOT expected to equal
`ff1fe0ec`. The build is green with this resolution today. Whether the resolved
framework matches the **live testnet protocol** at publish time is a deploy-day
re-verify (re-pin CLI + re-pull, commit `Move.lock`).

## The v1/v2 `@mysten/sui` split (Path A) — structural & proven

Two incompatible majors of `@mysten/sui` coexist because the SDKs we need
peer-require different majors. We isolate them by package:

| Island | `@mysten/sui` | Why | Packages |
|---|---|---|---|
| **v1** | `^1.45.2` (tops out at 1.45.2) | `@pythnetwork/pyth-sui-js@3.0.0` deps `@mysten/sui ^1.3.0` (v1). Client export is **`SuiClient`** (no `SuiJsonRpcClient` in v1). | `@seawall/agent`, `@seawall/keeper` |
| **v2** | `^2.17.0` (the `latest` tag) | `@mysten/deepbook-v3@1.4.1` peers `^2.17.0`; `@mysten/dapp-kit@1.0.6` peers `^2.16.2`. | `@seawall/dashboard` |
| **shared** | none | pure TS (types + constants); the only thing both majors import. | `@seawall/shared` |

`@pythnetwork/pyth-sui-js` tops out at **3.0.0** (no 4.x that would jump to v2),
so the split is stable for the hackathon window. **Proof gate:** after install,
`pnpm why @mysten/sui` must show `1.45.2` reachable only from agent+keeper and
`2.17.0` only from dashboard, with no v2 leaking into the agent. The benign
deepbook peer warning on install is expected.

> July-31-2026 cliff (post-deadline, irrelevant for Jun 21 + Demo Day): JSON-RPC
> sunset, Hermes API-key requirement, Pyth testnet State-ID migration. Pin
> pre-migration IDs; note in README.

## Move package (`packages/guardian`)

`Move.toml` dependency set lifted verbatim from the de-risk probe that compiled
green (RESULTS.md, Spike B): **`Pyth` + `deepbook` only**. Wormhole + Sui
framework + MoveStdlib + token are pulled transitively through Pyth with **no
version conflict** — so Wormhole is **not** listed explicitly (adding it risks a
duplicate-framework conflict). Build pulls: `MoveStdlib · Pyth · Sui · Wormhole ·
deepbook · token`.

Rev tags (all resolve as of 2026-06-12 via `git ls-remote`):

| Dep | rev | commit |
|---|---|---|
| Pyth (`pyth-crosschain`, `target_chains/sui/contracts`) | `sui-contract-testnet` (branch) | `62c7a5bc…` |
| deepbook (`deepbookv3`, `packages/deepbook`) | `testnet-v19.0.0` (tag) | `190ab8fd…` |
| Wormhole (transitive) | `sui/testnet` (branch) | `1b1cb69e…` |
| Sui framework (transitive, via Pyth/deepbook) | pinned in `Move.lock` | `718ae563…` / `041c5f2b…` |

(The CLI is the `testnet-v1.73.1` tag = `ff1fe0ec…`, a *different* commit from the
transitively-resolved framework source above — see the note below the table.)

**Gotcha:** the dep KEY must equal the package's own name — sui 1.73 makes a
mismatch a **hard error** (`deepbook` lowercase; `Pyth` capitalised). Pyth/Wormhole
are **branches** (float) → commit `Move.lock` and re-pull HEADs on deploy day.

Build: `pnpm move:build` (= `sui move build --path packages/guardian`). One
harmless upstream warning in Pyth's `price.move` doc-comment is expected.

## Commands

```bash
pnpm install              # installs all islands; creates the v1+v2 trees
pnpm why @mysten/sui      # SPLIT PROOF — must show two distinct trees
pnpm -r typecheck         # all TS packages
pnpm test                 # vitest across the workspace (incl. constants parity)
pnpm move:build           # guardian Move package
pnpm move:test            # guardian Move tests
```

## Re-verify on deploy day (~Jun 18–20)

- `npm view <pkg> version dependencies engines peerDependencies` for every pin
  (watch a pyth-sui-js 4.x that jumps to `@mysten/sui` v2 → would break the split).
- Re-pin `sui` CLI + the Move framework rev to the live testnet protocol tag.
- Re-read Pyth/Wormhole testnet State IDs **live** from the SDK `utils/constants.ts`
  (never freeze hex); re-pull Pyth `sui-contract-testnet` + Wormhole `sui/testnet`
  HEADs and commit `Move.lock`.
- Resolve the beta SUI/USD feed id live from the pyth-sui-js feed list; assert it
  on-chain. (Beta = hermes-beta, live runtime; mainnet id = Benchmarks, backtest
  history only — each 404s on the other host.)
