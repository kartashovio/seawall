<p align="center"><img src="assets/logo.png" width="120" alt="Seawall"/></p>

# Seawall — Autonomous Risk Guardian for Sui lending

Picture a guard standing over a lending protocol. He watches the price feeds and the order book all day, and the moment the oracle and the market start disagreeing, he tightens the protocol's risk settings — automatically, in one block, before anyone gets liquidated on a bad price. But here is the part that matters: nobody has to trust the guard. The contract he reports to re-checks every alarm against its own on-chain data, and it will only ever let him make the protocol *safer*. That guard is Seawall.

> **Sui Overflow 2026 — Agentic Web / Sub-track 1 (Autonomous Risk Guardian).**

## The problem, in one example

When Aave mis-liquidated wstETH positions, the last line of defense was a *trusted* off-chain agent watching the price. It failed, and millions were lost on a bad number that no one re-checked.

That is the whole category Seawall is built for: oracle and price anomalies on a lending protocol. The lesson is that the off-chain watcher cannot be the thing you trust. So in Seawall, it isn't.

## How it's trust-minimized (the make-or-break)

The off-chain ML agent is an **untrusted early-warning radar**, not an authority. Everything that could cause harm is decided on-chain, by the contract, on data it reads itself.

- **The contract re-derives every breach on-chain.** In the *same* PTB as the agent's fresh Pyth post, the Move policy reads `get_price_no_older_than` *and* the DeepBook level-2 book itself, computes the Pyth↔CLOB divergence, and acts on *that* — never on the agent's word. The price-feed and pool ids are asserted (`EWrongFeed` / `EWrongPool`), so the agent can't slip in a stale or wrong source.
- **The agent can only push safer.** Its request is a one-way ratchet, bounded to a corridor `[floor, baseline]` the DAO sets on-chain. A looser ask is rejected; an over-tight or malicious ask is clamped to the floor and logged. The raw 0–100 score never touches the logic path — it rides along as an advisory event field for the dashboard, nothing more.
- **A hard freeze is contract-only.** The market pause fires purely on the contract's *own* measured divergence crossing a threshold `T` (or an unusable book). The agent has no say in it whatsoever.
- **Only the DAO unfreezes.** Unfreezing and loosening go through a `&GovernanceCap` that lives as a separate *owned* object. The agent physically can't hold it, and a call into the shared policy can't bypass it.

So a compromised agent feeding garbage scores, trying to push *unsafe*, or trying to unfreeze, gets refused every time. Its number is never trusted; its effect is clamped to the safe direction; the breach it would act on is re-derived from raw Pyth + DeepBook on-chain.

## Three layers of enforcement

One signal — the Pyth↔DeepBook divergence — drives one escalation ladder. What changes is *who* is allowed to pull which rung.

1. **Inline floor.** The vault's per-borrow self-check: staleness, confidence, and divergence, checked on every `borrow`/`withdraw`. Always on, agent-independent — it protects users even if the agent is dead. This is the always-on loss-preventer.
2. **CAUTION (the AI's domain).** Graded tightening of `max_ltv` and `borrow_cap` as risk climbs. This is where the model earns its keep — but the contract approves or declines even this, taking `tighter_of(clamp(agent_request), contract_own_target)`. The agent's number is re-checked on every path; it is never applied blindly. Clamp-and-log, never abort.
3. **FREEZE.** A full market pause, **contract-only**, on the contract's own divergence reading `≥ T`. The agent has no freeze input. Un-freeze is DAO-only.

The invariant across all three: the agent can only ever move the system *safer*, within DAO-set bounds. It cannot cause loss, loosen, or unfreeze. Only the DAO moves toward riskier.

## The model

The agent runs an unsupervised anomaly detector. Each tick it reads a handful of market features and asks one question: how strange is the whole current picture versus what's been normal lately — not each number alone, but all of them together, including how they usually move in step. That "how strange" becomes the 0–100 score.

It watches the *combination*. It reacts when things that normally agree start to disagree, even when no single number looks scary on its own. The score splits across two knobs that answer two different questions:

- **`max_ltv` — "can we trust the price?"** Moves on oracle-vs-market divergence. A stablecoin de-peg is mispriced, not crashing, so only this knob should move.
- **`borrow_cap` — "how violent and fragmented is this?"** Moves on the asset's own volatility plus the broader market's. A violent crash tightens both.

The math is the **squared Mahalanobis distance** over an **EWMA-adaptive covariance**, mapped to 0–100 by the chi-squared tail with a calm dead-zone — so a genuinely calm market reads ~0 by construction, with a glass-box per-feature contribution breakdown you can inspect rather than trust. We name the prior art honestly: Mahalanobis-of-returns is the **Kritzman-Li Financial Turbulence Index**; the EWMA covariance is **RiskMetrics**. What's new is the *application* — oracle↔CLOB↔CEX divergence as a real-time breaker — and the *trust-minimized on-chain enforcement*. The estimator is borrowed and credited; an LLM writes the human-readable rationale only, never on the decision path.

Full derivation in [`docs/ml-methodology.md`](docs/ml-methodology.md).

## Does it actually catch crashes?

We replayed five real crashes minute by minute — the Oct 2025 SUI cascade, the Aug 2024 yen-carry unwind, the Feb 2025 tariff selloff, the Mar 2023 USDC de-peg, and the May 2025 Cetus exploit — on free, keyless data.

**It caught all five, and routed each to the right knob.** The two slow-drift events tripped the confirmed alarm *hours* ahead — about 5.3 and 6.3 hours. The three fast crashes were caught coincident; a near-vertical move gives no head start, and we don't pretend otherwise. The USDC de-peg is the cleanest proof of the two-knob split: only `max_ltv` moved while `borrow_cap` stayed wide open, because the asset was mispriced, not violent. Calm windows stayed quiet at the ~1% false-alarm rate the model was built for.

The honest limits are stated up front in the doc — the early-warning headline rests on n = 2 slow events, the graded floor is a bounded nudge and not a foresight metric, and depth features are live-only. Full results, every caveat, and the reproduce command in [`docs/ml-backtest.md`](docs/ml-backtest.md).

## Architecture

| Piece | What it does |
|---|---|
| `guardian` Move package | `GuardianPolicy` (shared) re-derives the Pyth↔DeepBook divergence on-chain and runs the 3-layer enforcement; `GovernanceCap` (owned) = DAO override |
| `demo_vault` | the demo consumer — a live Pyth-priced SUI position whose inline floor calls the same params-less `poke` on every borrow/withdraw |
| `@seawall/agent` | the off-chain EWMA-Mahalanobis detector → calibrated score + `ParamRequest`; one same-PTB `submit` when it would tighten |
| `@seawall/keeper` | permissionless params-less `poke` every 5 min (freeze / relax / liveness, fully ML-independent) |
| `@seawall/dashboard` | Vite + React: live gauge, model internals, on-chain action log, DAO override, attack panel |

The vault is just the *demo consumer*. The product is guardian-as-a-service: any lending or perp protocol deploys its own `GuardianPolicy`, sets its own corridor, and grants its own scoped cap.

## Why Sui

- **PTB atomicity** — post the fresh Pyth update, re-derive the breach, and act in *one* transaction. No relay window, no glue, no trust gap between sensing and acting.
- **Move capabilities / ownership** — the agent *physically* cannot hold the unfreeze cap; "only push safer" is enforced at the type level, not by convention.
- **DeepBook** — a native on-chain CLOB the contract reads itself as the divergence reference. The breach isn't reported to the contract; the contract sees it.
- **Composability** — one published package, many independent per-protocol policy objects. Adoption is a protocol deploying its own instance and granting a scoped cap.

## Where it sits

This is not "Sui has no circuit breakers." It does — Scallop runs outflow rate-limits, NAVI does stateless lowest-of-N price *selection*. The gap Seawall fills is narrower and real: it's the only **stateful Pyth↔CLOB-divergence anomaly trigger that is trust-minimized and external**, sitting between NAVI's stateless per-op check and today's manual, hours-late freezes.

Gauntlet and Chaos Labs Edge share the metric taxonomy and the goal (capital-efficiency vs risk), and they're the proof the category is real — but they are *trusted* off-chain providers; a protocol takes their number on faith. Seawall is trust-minimized: the contract re-derives the breach and the ratchet bounds the agent. Same taxonomy, enforced in-block without the trust.

## Deployed (Sui testnet)

| | id |
|---|---|
| **package** | [`0x2635919faff8a149b59389bec81fb059a2461b6b94c27fab3ac66581bde653ad`](https://suiscan.xyz/testnet/object/0x2635919faff8a149b59389bec81fb059a2461b6b94c27fab3ac66581bde653ad) |
| `GuardianPolicy` | `0xd6497edc5a130bb32c57d92b447f7a83588ca83df51ce8fde0ecf549640a44b6` |
| `GovernanceCap` | `0x9a72b115e1c10ae48af10395fca7007eae1369f9a1c5e6527841bf7add388e41` |
| `DemoVault` | `0xf9b3b69e3fd7f6b85533cfb2464aac3837a4c33d1f2cbf59b9f8539eadc4a79d` |

All ids live in [`config/testnet.json`](config/testnet.json). Demo video: _(YouTube, unlisted — see submission)_.

## How it meets the ST1 must-haves

1. **Live price feed** — Pyth SUI/USD (hermes-beta), posted same-PTB into `submit` / `poke` / `borrow`.
2. **Visible AI risk score + clear criteria** — the gauge plus glass-box model internals (d² / χ² and per-feature contributions); model in [`docs/ml-methodology.md`](docs/ml-methodology.md), measured criteria + backtests in [`docs/ml-backtest.md`](docs/ml-backtest.md).
3. **≥1 autonomous on-chain action via a Move policy object** — the agent's `submit` *originates* a CAUTION tighten on `GuardianPolicy`, no human in the loop; the contract-only freeze is the second.
4. **Human override** — `governance_unfreeze` through the owned `&GovernanceCap`, DAO-only.

## Honest scope

Seawall covers the **oracle / price-anomaly class** only. It does not catch key or governance compromise, contract logic bugs, or credit quality. We'd rather say that plainly than imply a guardian that catches everything.

## Run it

```bash
pnpm install
pnpm test                         # 152 TS tests
pnpm move:test                    # 75 Move tests
pnpm move:build

# verify the deployed contract end-to-end (devInspect + a few real txs, testnet):
pnpm --filter @seawall/agent  exec tsx scripts/deploy.ts        # create policy+vault, GATE 2/2b/3/3b
pnpm --filter @seawall/agent  exec tsx scripts/submit-smoke.ts  # GATE 4: autonomous submit + clamp
pnpm --filter @seawall/agent  exec tsx scripts/loop-smoke.ts    # GATE 5: warmup + elevate→tighten
pnpm --filter @seawall/keeper exec tsx scripts/keeper-smoke.ts  # GATE 6: permissionless poke

# run the live system:
pnpm --filter @seawall/agent     dev    # ML agent + control server (:8787, SSE + scenes)
pnpm --filter @seawall/keeper    dev    # 5-min keeper
pnpm --filter @seawall/dashboard dev    # dashboard (:5173)
```

Toolchain and the two deploy-day dependency gotchas (Pyth's two testnet deployments; DeepBook version-gating) are in [`docs/TOOLCHAIN.md`](docs/TOOLCHAIN.md); the frozen ABI in [`docs/ABI.md`](docs/ABI.md); the demo walkthrough in [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).
