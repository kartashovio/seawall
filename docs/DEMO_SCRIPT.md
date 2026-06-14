# DEMO_SCRIPT — Seawall (≤5 min)

The 4-scene testnet demo. Everything is live on the deployed package
(`config/testnet.json`); the only "demo" concessions are stated out loud.

## One-liner (open on the dashboard)

> "A trust-minimized autonomous circuit breaker for Sui lending. An off-chain ML
> agent is an untrusted early-warning radar — it can only ever make the protocol
> *safer*, because the contract re-derives every breach on-chain from raw Pyth +
> DeepBook and clamps the agent on every path. Its number is never trusted."

## Setup (before recording)

```bash
# three terminals (all read config/testnet.json)
pnpm --filter @seawall/agent     dev     # ML agent + SSE/scene control (:8787)
pnpm --filter @seawall/keeper    dev     # 5-min permissionless poke
pnpm --filter @seawall/dashboard dev     # dashboard (:5173)
```

Connect the wallet that holds the `GovernanceCap` (the deployer address) for Scene 4.
Header should read **agent live**; the on-chain action log already shows real
keeper pokes / agent ticks.

---

## Scene 1 — fast de-peg → **contract-only FREEZE** (the make-or-break)

*Narrate:* "The contract doesn't take the agent's word — it reads Pyth and the
DeepBook book itself, re-derives the divergence, and freezes on its OWN
measurement. Watch: no agent involved."

```bash
# creates a tight-threshold demo policy and pokes it; the contract re-derives its
# own Pyth↔DeepBook divergence and FREEZES. Note the printed demo-policy id.
pnpm --filter @seawall/agent exec tsx scripts/demo-freeze.ts
# point the dashboard at the just-frozen policy for the freeze + DAO scenes:
#   VITE_POLICY_ID=<printed id> pnpm --filter @seawall/dashboard dev
```

*On screen:* the red **MARKET FROZEN** banner; the L3 (FROZEN) lamp lights —
**contract-only, no agent attribution**; the `🧊 FROZEN — contract-only · div N%`
row in the action log, explorer-linked. *Say:* "prod threshold is 5% — a genuine
de-peg; this demo policy uses a tight threshold so testnet's thin DBUSDC pool
(~0.5% off Pyth) trips it. The freeze code is identical — only the DAO-set
threshold differs."

## Scene 2 — slow drift → **agent CAUTION** (the AI is load-bearing)

*Narrate:* "This is where the AI earns its place. A slow, stateful drift — each
tick individually in-bounds — that no inline check could catch. The
EWMA-Mahalanobis detector trips on the joint anomaly and ORIGINATES a tighten."

- Attack panel → **② Slow drift → agent CAUTION**.
- *On screen:* the gauge climbs; **Model internals** shows d² crossing the χ²(k)
  line while the per-feature contribution bars stay individually modest (the
  joint-anomaly money shot). The agent's `submit` lands — the action log shows
  `agent submit · applied LTV …` with a digest; the L2 (CAUTION) lamp lights,
  **agent-attributed**; the corridor bar's marker ratchets toward the floor.
- *Say:* "The agent originated this tighten — no human. The contract clamped its
  direction and magnitude; it never initiated. Manual freeze: hours. DAO vote:
  days. Seawall: seconds."

## Scene 3 — **malicious / compromised agent** → clamped & refused

*Narrate:* "Now the agent is compromised. It sends garbage and tries to wrench
the protocol open. The contract refuses every time — because it never trusted the
number."

- Attack panel → **③ Malicious agent (clamped)**.
- *On screen:* the action log fills with amber `⚠ clamped` / red `⛔ rejected`
  rows — the agent asked below the floor, the contract clamped it to the floor and
  logged it; a looser ask is rejected by the one-way ratchet. The applied params
  never go below the corridor floor.
- *Say:* "Its score is an event field — never on the logic path. Its request is
  clamped to the safe direction within DAO-set bounds. *This* is what
  trust-minimized means."
- *(Optional)* **④ Dead agent (L1 still holds)** → the agent goes silent; the L1
  inline floor still aborts an unsafe borrow (every borrow self-evaluates) and the
  keeper keeps `last_check` alive.

## Scene 4 — **human override** (DAO unfreeze)

*Narrate:* "Only the DAO can lift a hard stop — via an owned capability the agent
can't reach and a shared-object call can't bypass."

- With the dashboard pointed at the frozen demo policy (Scene 1) and the
  cap-holder wallet connected: **DAO override → Unfreeze (DAO)**.
- *On screen:* sign in the wallet → the `🔓 unfrozen by DAO` row lands; the FROZEN
  banner clears. *Say:* "The button was disabled until the connected wallet
  actually held the `GovernanceCap`. Authority lives in the owned object."

---

## Close

> "Same metric taxonomy as Gauntlet or Chaos Labs Edge — but enforced
> autonomously, in-block, and trust-minimized: the contract re-derives the breach
> and the agent can only ratchet toward safe. The last guardian of the Aave
> wstETH mis-liquidation was a trusted off-chain agent, and it failed. Ours
> can't."

## Honesty notes (say if asked; don't hide)

- The contract-only freeze threshold is tightened for the demo (prod = 5%); the
  *mechanism* is identical and live.
- Order-book depth features are live-only (no free historical depth); backtests
  cover divergence + volatility (`docs/ml-backtest.md`).
- The agent↔freeze are two separate txs (seconds apart / consecutive blocks), not
  one block — the "one PTB" claim is about post-Pyth-+-re-derive-+-act inside a
  single `submit`/`poke`, which is true.
- The ML estimator is named prior art (Kritzman-Li / RiskMetrics); the novelty is
  the application + the trust-minimized on-chain enforcement.
