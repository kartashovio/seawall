# Add the guardian to any Sui lending protocol

> This is the doc form of the **"Connect your protocol"** band on the [live dashboard](https://seawall.dev).
> Same six steps, same real commands and ABI — here you can copy-paste them.

One package, already published and immutable. You deploy **your own** policy against it, add a five-line gate to every borrow path, then pick how far you go. Your DAO keeps the corridor and the only unfreeze cap. The agent is never trusted — the contract clamps it to the safe direction and re-derives the breach itself.

Nothing here needs Seawall's involvement, our keys, or our servers. Adoption is per-protocol: you own every object and every key.

---

## Pick your mode first

| | **PUSH** — active enforcement | **PULL** — read-only signal |
|---|---|---|
| What it does | The guardian tightens your params **in-block** via a scoped cap you grant. | You read the guardian's signal and **enforce it yourself** in your own code. |
| Steps you do | **All six.** | **1–3 and 6** (skip the agent and the dedicated keeper). |
| You run | an agent + a keeper | nothing off-chain to run |
| You read | events, optionally | `is_paused` + the two `*_current_bps`, every gated tx |
| Trust | contract clamps the agent to safer-only | you trust only your own enforcement |

Both modes start the same way: deploy a policy (Step 1) and add the gate (Step 2).

---

## The gate (Step 2's artifact)

The literal change a vault makes to **every risk-increasing path** — `borrow()` and `withdraw_collateral()`. The same five `+` lines go in both, in the **same PTB as a fresh Pyth update**:

```move
// in borrow() and withdraw_collateral() — same PTB as a fresh Pyth update
+ assert!(object::id(policy) == vault.policy_id, EPolicyMismatch);     // bind the call to YOUR vault
+ let d = guardian::poke(&mut policy, &pio, &pool, &clock);            // re-derives the breach + writes state
+ assert!(!guardian::is_paused(&policy), EFrozen);                     // fail-CLOSED on freeze
  let coll = coll_value(divergence::pyth_px_1e9(&d));                  // one price read, no TOCTOU
+ assert!(debt * BPS <= guardian::max_ltv_current_bps(&policy)    * coll, ELtvExceeded);
+ assert!(debt * BPS <= guardian::borrow_cap_current_bps(&policy) * coll, EBorrowCapExceeded);
```

It re-derives the breach on-chain and **holds even if the agent is dead.** `deposit` and `repay` are toward-safe and stay ungated.

> **⚠️ Type-arg order trap.** `guardian::poke<Base, Quote>` = `[SUI, DBUSDC]`, but a `DemoVault<Quote, Base>` = `[DBUSDC, SUI]`. Never copy type args between the two — transposing them gives a bare Move type-mismatch with no hint that order is the cause.

---

## Step 1 · Deploy your policy · *DAO*

`create_policy` against the already-published package returns a **shared `GuardianPolicy`** + an **owned `GovernanceCap`** you transfer to your DAO. You set every bound; the cap is yours, never ours.

```ts
const tx = new Transaction();
const cap = tx.moveCall({
  target: `${PKG}::guardian::create_policy`,
  arguments: [
    tx.pure.address(AGENT_ADDR),      // registered_agent — who may submit (rotatable)
    tx.pure.vector("u8", feedId32),   // Pyth SUI/USD feed id — 32 raw bytes
    tx.pure.id(POOL_ID),              // expected_pool_id — asserted on every read
    tx.pure.u16(5500), tx.pure.u16(7500),    // max_ltv  floor / baseline (bps)
    tx.pure.u16(4000), tx.pure.u16(10000),   // borrow_cap floor / baseline (bps)
    tx.pure.u128(50_000_000),   // threshold_t  — FREEZE at 5% divergence
    tx.pure.u128(10_000_000),   // d_caution    — CAUTION onset at 1%
    tx.pure.u128(10_000_000),   // conf_frac_max
    tx.pure.u64(60),            // max_age_secs — Pyth staleness, seconds
    tx.pure.u8(9), tx.pure.u8(6),            // base / quote decimals (SUI / DBUSDC)
    tx.pure.u64(600_000), tx.pure.u64(600_000),  // all_clear_window / relax_cooldown (ms)
    tx.pure.u16(1000),          // relax_step_frac_bps — 10% of span per step
    tx.object("0x6"),           // Clock
  ],
});
tx.transferObjects([cap], tx.pure.address(DAO_ADDR)); // the cap leaves the deployer
```

16 positional args + the `Clock`. The call **shares** the policy and **returns** the `GovernanceCap`, so the PTB must transfer it. `expected_pool_id` and `feed_id` are asserted on every read — no caller can swap in a fake-calm pool or a different feed.

Bounds shown are our testnet corridor: **max_ltv 55–75%, borrow_cap 40–100%, FREEZE 5%, CAUTION 1%.**

> **demo → prod:** single key in this demo → a **DAO multisig** holds the cap in production.

---

## Step 2 · Add the gate · *contract*

The five lines above, in every `borrow()` and `withdraw_collateral()` — every path that raises risk. The policy-id binding ties the call to your vault, `poke` re-derives the breach on-chain, the freeze check fails **closed**, the two asserts read the live caps. It holds even if the agent is dead.

(The full diff and the type-arg trap are in [The gate](#the-gate-step-2s-artifact) above.)

---

## Step 3 · Get the source & fund gas · *DAO*

Install the CLI, clone the open-source repo, fund the address that deploys (and, in PUSH, runs). Calm markets cost ≈0 — the agent sends only when risk warrants.

```bash
# install the Sui CLI at the testnet pin (suiup / brew / prebuilt release tarball)
sui --version                             # confirm the pin matches the Move framework rev
sui client faucet                         # testnet gas (mainnet = real SUI, no faucet)
git clone https://github.com/kartashovio/seawall.git
cd seawall && pnpm install                # your deployed ids are written to config/testnet.json
```

Adoption **reuses the single published package** — no republish needed. For full upgrade-authority sovereignty you may fork, re-pin `Move.toml` to mainnet revs, publish your own copy, and point `create_policy` at it; the ABI is identical.

---

## Step 4 · Run your agent · *agent — UNTRUSTED* · PUSH only

The ML detector scores the market every ~60 s and posts **one PTB** — a fresh Pyth update plus a tighter-only request — only when it would tighten or on a 5-min heartbeat. Its score is an event field, **never on the decision path.** The agent is replaceable; the contract clamps any model.

```ts
// loads the registered_agent key at RUNTIME from the CLI keystore
// (sui keytool export …) — never hardcoded, never an env var. Only env: AGENT_PORT.
pnpm --filter @seawall/agent exec tsx src/index.ts

// the submit PTB — sender must equal policy.registered_agent
const data  = await conn.getPriceFeedsUpdateData([feedId]);      // hermes-beta
const [pio] = await pythClient.updatePriceFeeds(tx, data, [feedId]);
const req   = tx.moveCall({ target: `${PKG}::guardian::new_param_request`,
              arguments: [tx.pure.u16(maxLtvTarget), tx.pure.u16(borrowCapTarget)] });
tx.moveCall({ target: `${PKG}::guardian::submit`, typeArguments: [SUI, DBUSDC],
  arguments: [tx.object(policy), tx.object(pio), tx.object(pool), tx.object(clock), req, tx.pure.u8(advisoryScore)] });
```

Sends **iff** (A) the request tightens `max_ltv` or `borrow_cap` below the on-chain current **and** the 1-min resubmit cooldown has passed, **or** (B) a 5-min heartbeat elapsed (calm = 0 tx). The contract takes `min(clamp(ask, [floor, baseline]), its own target)`; a looser ask is refused on-chain (`RequestRejected`, no tx failure) — the one-way ratchet.

> **demo → prod:** CLI-keystore key in this demo → a **secret manager / KMS** in production.

---

## Step 5 · Run your keeper · *contract* · PUSH only

A permissionless, params-less `poke()` every 5 min from its **own throwaway key** — not the agent's. It keeps the contract re-deriving (so the contract-only FREEZE fires and the gated RELAX can resume) even if the agent dies. A missed poke is safe — fail-**closed**.

```ts
pnpm --filter @seawall/keeper dev
// key: KEEPER_KEY (bech32 env) → gitignored packages/keeper/.keeper.key (0600)
//      → auto-generated + saved on first run. One-time 0.2 SUI top-up from the deployer.

const [pio] = await pythClient.updatePriceFeeds(tx, data, [feedId]);
tx.moveCall({ target: `${PKG}::guardian::poke`, typeArguments: [SUI, DBUSDC],
  arguments: [tx.object(policy), tx.object(pio), tx.object(pool), tx.object(clock)] }); // return discarded
```

It refuses to start if its key equals `registered_agent` — the proof that `poke` is permissionless (it chooses only **when** to poke a deterministic function, never the outcome). A broke or dead keeper is safe: the inline floor still protects; only the liveness heartbeat + gated RELAX pause.

> In **PULL** you don't run a dedicated keeper. Your own gated txs already call `poke` and keep state fresh; a periodic poke from any caller covers quiet stretches so freeze/relax stay live.

> **demo → prod:** testnet faucet in this demo → a **pre-funded ops wallet** on mainnet (no faucet).

---

## Step 6 · Govern & monitor · *DAO*

Your DAO holds the `GovernanceCap` — the only way to unfreeze, widen the corridor, or rotate the agent. The agent and the permissionless paths touch none of it. Monitor everything with permissionless `queryEvents` — no cap needed (this is the whole PULL loop).

```ts
// &GovernanceCap is the 2nd arg every time — an owned object, never in the policy
governance_unfreeze(policy, cap, clock);               // absolute; re-freezes if breach persists
governance_set_corridor(policy, cap, …, clock);        // the only instant-loosen (re-clamps current)
governance_rotate_agent(policy, cap, newAgent, clock); // swap the off-chain model

// monitor — permissionless, no cap (this IS the PULL operating loop)
queryEvents({ query: `${PKG}::guardian::RiskEvaluated` }); // advisory_score, div_own, applied caps
is_paused(policy) · max_ltv_current_bps(policy) · borrow_cap_current_bps(policy)
```

Also emitted: `Frozen` (contract-only, cause 0 = div ≥ T / 1 = book-not-ok), `RequestClamped`, `RequestRejected`, `Unfrozen`, `CorridorChanged`, `AgentRotated`.

> **PULL correctness:** read `is_paused` + the two `*_current_bps` in the **same PTB** as the price and enforce them yourself — never cache them across txs. The corridor moves and a stale read is a stale gate.

---

## The trust rails (held in every step)

- The **agent is the only untrusted step** — amber above, a one-way-ratchet clamp under it. Its score is event-only.
- **FREEZE is contract-only**; **unfreeze / widen-corridor / rotate** are `GovernanceCap`-only.
- The keeper uses its **own throwaway key**, provably not the agent's.
- Every command and ABI above is real and verified against the `guardian` package + the agent + keeper source.

## Live reference

| | id |
|---|---|
| package | [`0x2635919f…653ad`](https://suiscan.xyz/testnet/object/0x2635919faff8a149b59389bec81fb059a2461b6b94c27fab3ac66581bde653ad) |
| policy | [`0xd6497edc…44b6`](https://suiscan.xyz/testnet/object/0xd6497edc5a130bb32c57d92b447f7a83588ca83df51ce8fde0ecf549640a44b6) |

The frozen, full ABI is in [`ABI.md`](ABI.md); the plain-English architecture is in [`../architecture.md`](../architecture.md).
