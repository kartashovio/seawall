# DEMO_SCRIPT — Seawall (≤5 min)

A narrated walk **down the live dashboard** (https://seawall.dev) — top to bottom, the
architecture told as a chain — that lands the 4-scene testnet demo on the way.
Everything is live on the deployed package (`config/testnet.json`); the only "demo"
concessions are stated out loud.

Timing target: **≤5:00**. Suggested budget per block is in the heading.

---

## 0 · Cold open — the one-liner (0:00–0:25)

*On screen:* the dashboard masthead. The **DEPLOYED ON TESTNET** pill, and the
"Chain reads" rail: **radar live · keeper poke · guardian healthy**.

*Say:* "This is Seawall — a trust-minimized autonomous circuit breaker for Sui
lending. An off-chain ML agent watches the oracle and the order book. It can only
ever make a protocol *safer* — because the contract re-derives every breach itself,
on-chain, from raw Pyth and DeepBook, and clamps the agent on every path. Its number
is never trusted."

> Note: front-loads the trust-min differentiator (the judge make-or-break + the
> rubric's Real-World 50%) in the first sentence. The "Chain reads" rail = the three
> liveness signals so the "live, deployed" claim is on screen, not just spoken.
> **Trim to 0:15** if you need ~10s of headroom — the one-liner can drop its second sentence.

---

## 1 · The chain — "You never have to trust it" (0:25–1:05)

*On screen:* scroll to the **How it works** band. Read the bold claim, then the
**FlowStrip** left to right: **AI radar · 0–100 advisory → contract re-derives breach
→ act · one PTB**. Then the seam line, then the **L1/L2/L3 enforcement ladder** lit
live.

*Narrate:* "One claim, then the wiring. The agent emits a 0-to-100 advisory. The
contract re-derives the breach for itself. Then it acts — posting the fresh Pyth
update and acting on the re-derived breach in one transaction."

*Say (over the ladder):* "Three layers, one signal — Pyth-versus-DeepBook
divergence. **L1, inline floor:** the contract, enforcing on every borrow and
withdraw, alive even if the agent dies. **L2, caution limits:** the agent originates
a tighter request, the contract clamps it inside DAO bounds — one-way, only safer.
**L3, market freeze:** contract-only — the agent has no role. The keeper just pokes
it so the contract keeps re-deriving."

*On screen (optional, ~5s):* open **"Open the full architecture"** — the four zones,
the same-PTB submit edge, the two feed-to-chain arcs. Then **"Why Sui":** one atomic
PTB, Move capabilities, native DeepBook CLOB.

> Note: narrates the ladder by its real on-screen lamp names (L1 inline floor / L2
> caution limits / L3 market freeze) and their states. Keeps the agent⟂contract
> severance ("contract-only · agent stops here") explicit — that's the whole pitch.

---

## 2 · One model, two seas (1:05–1:35)

*On screen:* the **two seas** band. The claim "One model, two seas — enforced on
testnet, observing mainnet." The calibration strip, then the two **ScoreCards**:
**TESTNET — ENFORCED · IN USE** (emerald) and **MAINNET — READ-ONLY · OBSERVING**.

*Say:* "The same unchanged model runs in two places. On testnet it drives live
on-chain enforcement. On the real mainnet SUI/USDC market it reads only — and it sits
calm. That's the proof the model isn't trigger-happy: it's quiet on the real market;
only the thin testnet sandbox runs jumpy, by design."

*On screen:* glance at each card's **Pyth↔DeepBook divergence** meter — caution at
1%, contract-freeze at 5% — and the risk-history strip below.

> Note: the calm-mainnet / jumpy-testnet contrast is the false-positive answer a
> technical judge will look for, so it gets a full sentence. Names the real ribbon
> text ("ENFORCED · IN USE" / "READ-ONLY · OBSERVING").

---

## 3 · The reading — the glass box (1:35–2:05)

*On screen:* **The reading** band, card heading **"From measurement to limit."** The
**d² vs the χ²(k) trip line**, the **per-feature contribution bars**, then the
agent⟂contract negotiation drawn on the DAO corridor (agent asks · contract target ·
applied ◆).

*Say:* "This is the glass box. The detector is an EWMA-adaptive Mahalanobis distance
over a six-feature vector. Each feature can sit below its own threshold and the
combined distance still trips — the joint anomaly a single check can't see. Below it,
the negotiation: the agent asks for a limit, the contract takes the *tighter* of that
and its own divergence reading, and the applied diamond can only ratchet toward the
floor. The score never enters this math — it's an event field."

*Say (the honesty line):* "And we name the prior art: Mahalanobis is Kritzman-Li
financial turbulence, the EWMA covariance is RiskMetrics. The novelty isn't the
estimator — it's the application and the trust-minimized on-chain enforcement."

> Note: this band was formerly "Model internals / the instruments" — all such
> references now point here. The Kritzman-Li / RiskMetrics caveat is spoken, not
> hidden. Front-loads "joint anomaly" (the Scene-2 money shot) so it pays off shortly.

---

## 4 · Proven on real crises (2:05–2:35)

*On screen:* the **Proven on real crises** backtest band. The three proof chips —
**2 contract FREEZES · 3 graded CAUTION tightens · regression-verified** — then the
**Oct-10** case open by default; click one or two more spoilers (USDC, Feb-2025).

*Say:* "The same unchanged model, replayed through five real crashes. Oct-10 2025 —
the largest liquidation cascade ever: the contract's own divergence blows past 5%, it
*freezes* on its own data, no human, no DAO vote — one block. The USDC SVB depeg —
another contract freeze on raw divergence. Feb-2025 tariff crash — no freeze, but the
agent's caution tighten is the only thing acting; that's the ML earning its place."

*Say (caveat, on screen via the case chips):* "Backtests cover divergence and
volatility from free price history. Order-book *depth* isn't publicly archived — those
features run live only, shown above, not back-tested."

> Note: leads with the two FREEZES (strongest result) and names Feb as the
> "ML earns its place" case — matches the band's own framing. The depth caveat is
> kept and tied to the on-screen "Honest scope" spoiler.

---

## 5 · The 4-scene drill (2:35–4:05)

The interactive heart. Scroll to **The drill / Attack panel** — but trigger the
**contract-only FREEZE separately** (it's not in this panel).

### Scene ① Fast de-peg → agent hard tighten (2:35–2:55)

*On screen:* Attack panel → **① Fast de-peg → agent hard tighten**.

*Say:* "A fast de-peg. The agent's score spikes, both knobs slam toward the floor —
and the action log shows the contract clamped the request to the safe direction. The
agent originated it; the contract decided how far."

### Scene ② Slow drift → agent CAUTION — the AI is load-bearing (2:55–3:25)

*On screen:* Attack panel → **② Slow drift → agent CAUTION**. Scroll up to **The
reading**: **d² crosses the χ²(k) line while the per-feature bars stay individually
modest.** Then the action log: an agent submit row, the **L2 caution-limits** lamp
lit (amber, agent-attributed), the corridor diamond ratcheting toward the floor.

*Narrate:* "This is where the AI earns its place. A slow, stateful drift — each tick
individually in-bounds — that no inline check could catch."

*Say:* "Watch the reading: every feature is below its own line, yet the combined
distance trips. The agent originates a tighten — no human. The contract clamped its
direction and magnitude. Manual freeze: hours. DAO vote: days. Seawall: **one block**."

### Scene ③ Malicious agent → clamped & refused (3:25–3:50)

*On screen:* Attack panel → **③ Malicious agent (clamped)**. The **On-chain action
log** fills with amber **CLAMP** rows and coral **REJECT** rows.

*Say:* "Now the agent is compromised — it sends garbage and tries to wrench the
protocol open. The contract refuses every time. Amber CLAMP: it asked below the floor,
the contract pinned it to the floor and logged it. Coral REJECT: it asked to loosen,
the one-way ratchet rejected it. That's distrust, recorded on-chain. *This* is what
trust-minimized means."

### Scene ④ Dead agent → L1 still holds (3:50–4:05)

*On screen:* Attack panel → **④ Dead agent (L1 still holds)**. The radar goes silent;
the guardian-healthy and keeper signals stay alive.

*Say:* "Kill the agent entirely. The L1 inline floor still aborts an unsafe borrow —
every borrow self-evaluates — and the permissionless keeper keeps the contract
checking. No agent required for the floor to hold."

> Note: scene labels match the AttackPanel buttons verbatim (① / ② / ③ / ④ glyphs).
> The action-log row names are the live badges — CLAMP (amber) / REJECT (coral).
> Scene ② is the canonical "AI is load-bearing" beat, so it gets the most time and
> ties back to "The reading."

---

## 6 · The contract-only freeze, recorded (4:05–4:30)

*On screen:* the **"The freeze, recorded"** band — the recorded LIVE → FREEZE → ABORT
→ UNFREEZE cycle, four numbered real transactions, state-coloured, explorer-linked.
The **demo T = 0.02%** vs **prod T = 5%** caveat is on the card.

*Say:* "The freeze is contract-only, so it's not in the attack panel — it's triggered
separately, by a real DeepBook divergence. Here's one full cycle recorded on testnet:
a healthy borrow, a keeper poke that makes the contract freeze on its *own* measured
divergence, the same borrow now aborting at the inline floor, then the DAO lifting the
halt. Four real transactions — verify every hash."

*Say (the caveat, must stay):* "Honest concession: this policy's freeze threshold is
dialed down for the demo — T = 0.02% — so testnet's thin pool, which sits about 0.35%
off Pyth, trips it on cue. Production is 5%; the pool would have to actually de-peg.
Same freeze code, same on-chain re-derivation — we moved the bar, not the reading."

> Note: replaces the stale "scripts/inject-divergence" mental model — this is the
> *recorded* witness band (the live trigger is `scripts/demo-freeze.ts`, run off
> screen). The demo-T (0.02%) vs prod-T (5%) caveat is spoken in full. The freeze
> is explicitly NOT agent-attributed.

---

## 7 · Human override (4:30–4:45)

*On screen:* the **Human override** band — the live DAO console. With the cap-holder
wallet connected, press **Unfreeze (DAO)**.

*Say:* "Only the DAO lifts a hard stop — through an owned capability in its wallet
that the agent can't reach and a shared-object call can't bypass. The button was
disabled until the connected wallet actually held the GovernanceCap. The same cap sets
the corridor bounds and rotates the agent. Single key in this demo; production runs a
DAO multisig."

> Note: real button label ("Unfreeze (DAO)") and the real gating rule (disabled until
> the wallet holds the cap). Single-key concession kept.

---

## 8 · Connect your protocol + close (4:45–5:00)

*On screen:* the **Connect your protocol** band — the four-line diff in `borrow()` /
`withdraw_collateral()`, the deploy → gate → agent steps.

*Say:* "Any Sui lending protocol adopts this: deploy a GuardianPolicy, add four lines
to every risk-increasing path, run the agent — or just read the signal and run no
agent at all. You keep the corridor and the cap."

*Close:* "Same metric taxonomy as Gauntlet or Chaos Labs Edge — but enforced
autonomously, in-block, and trust-minimized: the contract re-derives the breach, and
the agent can only ratchet toward safe. The last guardian of the Aave wstETH
mis-liquidation was a trusted off-chain agent, and it failed. Ours can't. Live now at
seawall.dev."

> Note: keeps the close almost verbatim (Gauntlet/Chaos = framing reference, never a
> claim of their sim infra — the RED LINE). Adds the guardian-as-a-service adoption
> line so Real-World 50% lands at the end too, and a single seawall.dev CTA.
> **Trim to 0:20** if over time — the connect line compresses to one sentence.

---

## Setup (before recording)

```bash
# three terminals (all read config/testnet.json)
pnpm --filter @seawall/agent     dev     # ML agent + SSE/scene control (:8787)
pnpm --filter @seawall/keeper    dev     # permissionless poke (keeps the contract re-deriving)
pnpm --filter @seawall/dashboard dev     # dashboard (:5173) — or use the live https://seawall.dev
```

Connect the wallet that holds the `GovernanceCap` (the deployer address) for Scene 7.
Header should read **radar live**; the on-chain action log already shows real keeper
pokes / agent ticks.

⚠️ Page order ≠ script order: the page renders the recorded freeze + DAO override
**before** the attack-panel drill, but the script narrates the drill first (blocks
5 → 6 → 7). Plan the screen-record to scroll up from the drill, or pre-scroll, so
there's no on-camera scroll-hunt.

For the contract-only freeze (block 6 is a RECORDED cycle, but if you want to trigger
one live): `pnpm --filter @seawall/agent exec tsx scripts/demo-freeze.ts` — it creates
a tight-threshold demo policy, pokes it, and the contract re-derives its own
Pyth↔DeepBook divergence and FREEZES. Note the printed demo-policy id; point the
dashboard at it with `VITE_POLICY_ID=<id>`.

---

## Honesty notes (say if asked; don't hide)

- The contract-only freeze threshold is tightened for the demo (**T = 0.02%**, prod =
  **5%**); the *mechanism* is identical and live.
- Order-book depth features are live-only (no free historical depth); backtests cover
  divergence + volatility (`docs/ml-backtest.md`).
- The agent's tighten and the contract's freeze are two separate transactions (seconds
  apart / consecutive blocks), not one block — the "one PTB" claim is strictly about
  post-Pyth-+-re-derive-+-act inside a single `submit`/`poke`, which is true.
- The ML estimator is named prior art (Kritzman-Li / RiskMetrics); the novelty is the
  application + the trust-minimized on-chain enforcement.
