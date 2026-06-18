I have all three readings plus the real constants confirmed. The documented values match the on-chain/off-chain claims (keeper 5min, agent heartbeat 5min, agent grid 1min, resubmit cooldown 1min). I have everything needed to produce the verdict and diagram spec.

## PART 1 — FIDELITY VERDICT

**Legend per item:** ✅ AS-SPEC · 🔶 WITH-DIFFERENCE · ❌ NOT-IMPLEMENTED · ➕ EXTRA. Names are verbatim from the shipped code (`guardian`/`divergence`/`demo_vault`/`constants` Move modules + `agent`/`keeper` TS).

### Entities & roles

| # | Documented element | Verdict | Evidence |
|---|---|---|---|
| 1 | `[offchain] ML модель` → AI risk score + `max_ltv` + `borrow_cap` | ✅ AS-SPEC | `agent/src/policy-logic.ts::computeRequest` → `scoreToParams` maps **solvency→max_ltv, liquidity→borrow_cap**; `advisory_score` carried separately. |
| 2 | `liq_buffer` not touched ("агент может навредить") | ✅ AS-SPEC (intentional drift, honored) | No liq-buffer param anywhere. Agent-tunable set = `{max_ltv, borrow_cap}` only. On-chain `combine_param` only ever moves these two. |
| 3 | `[offchain] keeper`, params-less `div_own` recompute every 5min, updates `last_check` | ✅ AS-SPEC | `keeper/src/tx.ts::buildPokeTx` → `guardian::poke(policy, pio, pool, clock)` (no req/score). `KEEPER_TICK_MS=300_000`. `apply_` always sets `last_check_ms := now`. |
| 4 | `[onchain] код-пакет` = decision/enforcement | ✅ AS-SPEC | `guardian` package; one `apply_` is the decision core. |
| 5 | `[protocol] лендинг протокол` = consumer | ✅ AS-SPEC (modeled by demo) | `demo_vault::DemoVault` is the demo consumer; `guardian` is the reusable per-protocol package. |

### offchain: ML — send rule

| # | Documented element | Verdict | Evidence |
|---|---|---|---|
| 6 | Send `ParamRequest` when `clamp(target)` tighter than current | 🔶 WITH-DIFFERENCE | Send-gate `shouldSend` triggers on `tighter` (computed < lastApplied), **rate-limited by `RESUBMIT_COOLDOWN_MS=60_000` (1min)**. Functionally equivalent but throttled — not every tighter tick fires; doc omits the cooldown. |
| 7 | …OR every 5 minutes (heartbeat) | ✅ AS-SPEC | `shouldSend` branch (B): `now − lastSentMs ≥ AGENT_HEARTBEAT_MS (300_000)`. `lastSentMs` init at construction so a calm boot doesn't insta-fire. |
| 8 | "clamp(target)" is the thing checked | ✅ AS-SPEC | `decideRequest`: `req = min(computed, applied)` after `clampToCorridor([floor,baseline])`. Tighter-or-equal only. |

### onchain: the decision

| # | Documented element | Verdict | Evidence |
|---|---|---|---|
| 9 | Runs with agent params OR without | ✅ AS-SPEC | Two entrypoints `submit` (with `ParamRequest`+score) and `poke` (None,0) → single private `apply_(... option<ParamRequest> ...)`. |
| 10 | `agent_req` optional | ✅ AS-SPEC | `apply_` takes `option::some(req)` from `submit`, `option::none()` from `poke`; agent term defaults to `baseline` on None. |
| 11 | `div_own = f(divergence, depth)` with coin_decimal factor | ✅ AS-SPEC | `divergence::compute_divergence` + `dbk_mid_1e9` apply `10^(base−quote)` decimal factor; `DivResult.div` is the re-derived figure. |
| 12 | `if divergence ≥ X% → is_frozen=true` | ✅ AS-SPEC | `apply_` L3: `div >= policy.threshold_t` → `paused=true`, `Frozen{cause=0}`. `T_FREEZE=5.0%`. |
| 13 | `else if depth DeepBook != ok → is_frozen=true` | ✅ AS-SPEC | `book_not_ok` (empty/one-sided, `signal==SIGNAL_BOOK_NOT_OK`) → `paused=true`, `Frozen{cause=1}`. |
| 14 | `else → onchain_own(div_own)` | ✅ AS-SPEC | `tier_target`: discrete tiers 0–3 over `[d_caution, threshold_t)` → contract-own param target. |
| 15 | `desired = tighter_of(clamp(agent_req,floor,baseline), clamp(onchain_own,floor,baseline))` | ✅ AS-SPEC | `combine_param`: `target = min(clamp_u16(agent), clamp_u16(own_tier))` (lower bps = safer). Exact match. |
| 16 | if `desired` tighter than `current` → `current = desired` instantly | ✅ AS-SPEC | `combine_param`: `target < current → (target, false)` instant ratchet. |
| 17 | else → 1 step toward `desired`, only while all-clear (slow self-relax) | ✅ AS-SPEC | `relax_ok` gate (`!paused && quiet-window && cooldown && div<d_caution && !book_not_ok && !conf_breach`) → one drip step `span·relax_step_frac_bps/bps_denom`. **Agent silence grants no relax.** |
| 18 | `last_check = now` | ✅ AS-SPEC | `apply_`: `last_check_ms := now` every call. |

### protocol: inline path

| # | Documented element | Verdict | Evidence |
|---|---|---|---|
| 19 | `borrow`/`withdraw_collateral` run on-chain calc params-less | ✅ AS-SPEC | `demo_vault::{borrow,withdraw_collateral}` → `inline_poke` → `guardian::poke` (byte-identical permissionless call, no params). |
| 20 | Results written to & used from `GuardianPolicy` | ✅ AS-SPEC | `poke` writes `paused`/`current` into the shared `GuardianPolicy`; vault reads `*_current_bps`. |
| 21 | `is_frozen` → tx rejected | ✅ AS-SPEC | `enforce_solvency`: `assert!(!is_paused(policy), EFrozen)` checked FIRST (fail-CLOSED). |
| 22 | New `max_ltv`/`borrow_cap` violated → tx rejected | ✅ AS-SPEC | `assert!(debt·bps ≤ max_ltv_current·coll_value, ELtvExceeded)` + `…borrow_cap_current… EBorrowCapExceeded`. Cross-multiplied, no division; valued with the SAME `DivResult` (no TOCTOU). |

### Safety frame

| # | Documented element | Verdict | Evidence |
|---|---|---|---|
| 23 | Freeze covers `borrow` + `withdraw_collateral` | ✅ AS-SPEC | Both gated; `repay`/`deposit_collateral` ungated (toward-safe); **`liquidate` intentionally NOT gated** (D6 — freezing it traps bad debt). |
| 24 | Only DAO/owner can unfreeze | ✅ AS-SPEC | `governance_unfreeze(policy, cap: &GovernanceCap, clock)` — owned-cap gated. No other unfreeze path. |
| 25 | Settings change toward-safer only (limited agent trust) | ✅ AS-SPEC | One-way ratchet both off-chain (`decideRequest`) and on-chain (`combine_param`). |
| 26 | Tighten instant via `tighter_of`; relax by drip | ✅ AS-SPEC | Items 16–17. |
| 27 | Relax one notch / 10min absent reason to stay strict | ✅ AS-SPEC | `RELAX_COOLDOWN_MS = ALL_CLEAR_WINDOW_MS = 600_000` (10min); `RELAX_STEP_FRAC_BPS=1000` (10%/step). |
| 28 | DAO/owner sets `[baseline ; cap]` corridor | 🔶 WITH-DIFFERENCE (naming) | `governance_set_corridor(... floor_bps, baseline_bps ...)`. Doc says `[baseline ; cap]`; code names the loosest bound **`baseline`** and the tightest **`floor`** (doc's "cap"≈code "floor"). Semantics identical, label swap only. |
| 29 | Any protocol can run its own off-chain agent | ✅ AS-SPEC | Per-protocol `registered_agent` field + `governance_rotate_agent`; ABI is the only contract — open/replaceable agent. |
| 30 | Protocol can only change its OWN `GuardianPolicy` | ✅ AS-SPEC | `assert_cap`: `cap.policy_id == object::id(policy)` (`EWrongGovernanceCap`); `read_divergence` asserts `expected_pool_id`/`feed_id`. Anti-attacker bind enforced. |
| 31 | Record `last_change` (besides `last_check`) for relax/freeze timeouts | ✅ AS-SPEC | `last_change_ms` field, written only on change; `last_breach_ms`/`last_relax_ms` drive relax timing. |

### Why Sui

| # | Documented element | Verdict | Evidence |
|---|---|---|---|
| 32 | PTB atomicity | ✅ AS-SPEC | `tx.ts::buildSubmitPtb`: `updatePriceFeeds` + `new_param_request` + `submit` in ONE PTB. |
| 33 | Move capability/ownership at type level | ✅ AS-SPEC | `GovernanceCap` owned (`key,store`), never embedded; `PauseCap`/`ParamCap` embedded scoped caps. Agent type-level cannot reach unfreeze. |
| 34 | Native CLOB DeepBook | ✅ AS-SPEC | `read_divergence` calls `pool.get_level2_ticks_from_mid` on-chain. |

### EXTRA (in code, not in doc)

| # | Element | Note |
|---|---|---|
| E1 | ➕ `conf_frac` / `CONF_FRAC_MAX` confidence-width breach | Pyth conf-width gate (`conf_breach` forces ≥tier-1 and blocks relax). Doc's `div_own = f(divergence, depth)` omits the conf leg. |
| E2 | ➕ `expected_pool_id` + `feed_id` asserts (`EWrongPool`/`EWrongFeed`) | Trust-min linchpin (must-fix #1) — not in doc but central to the design. |
| E3 | ➕ Full event suite (`RiskEvaluated`, `RequestClamped`, `RequestRejected`, `Frozen{cause}`, etc.) | Dashboard wiring; `advisory_score` lives ONLY in `RiskEvaluated` (grep-gate honored). |
| E4 | ➕ Separate **keeper** key (≠ `registered_agent`, boot-asserted) + drift-free scheduler | Permissionlessness proven by construction; doc folds keeper into "offchain". |
| E5 | ➕ Demo scene overrides (`dead`/`malicious`/`elevate`) + read-only mainnet observatory | Demo machinery; observatory strictly post-decision, never on enforced path. |
| E6 | ➕ `governance_rotate_agent` | Agent rotation; implied by "own agent" decentralization but not explicit in doc. |

### Known intentional drifts (all correctly honored)

- **L3 freeze is contract-ONLY, no agent T-modulation** — confirmed: `apply_` L3 reads only `div >= threshold_t || book_not_ok`; `advisory_score` has zero influence (its sole use is the `RiskEvaluated` event field). The dropped "agent modulates T within [0.8T,T]" is correctly absent.
- **`liq_buffer` not agent-tunable** — confirmed: no such param exists; agent set is `{max_ltv, borrow_cap}` (item 2).
- **Advisory 0–100 score is event-only** — confirmed: `submit` passes `advisory_score:u8` straight into `RiskEvaluated`; the contract never branches on it; keeper never imports `@seawall/model`.

### ✅ One-line verdict: **FAITHFUL-WITH-MINOR-DRIFT**

The shipped Move + TS implement every documented element 1:1. The only deltas are (a) two cosmetic naming gaps — design term `evaluate()`→shipped `submit`/`poke`, doc `[baseline;cap]`→code `[floor;baseline]`; (b) an undocumented-but-present 1-min resubmit cooldown on tighten sends; and (c) the code is *stricter/richer* than the doc (conf-width gate, pool/feed asserts, separate keeper key, full event suite). No element is missing or contradicted; all three intentional drifts are correctly honored.

---

## PART 2 — DIAGRAM SPEC

A single hand-built inline **SVG** React component. **`viewBox="0 0 1200 560"`**, light theme, reads in <10s. No diagram lib — every node is a `<rect rx=10>` + `<text>`, every edge a `<path>`/`<line>` + `<marker>` arrowhead.

### Palette (CSS custom props or inline constants)

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0B1B2B` | primary text / strokes |
| `ink-soft` | `#5A6B7B` | sublabels |
| `sui-blue` | `#4DA2FF` | accent, on-chain zone, action edges |
| `sui-blue-wash` | `#EAF4FF` | on-chain zone fill |
| `agent-wash` | `#F4F7FA` | off-chain zone fill |
| `feed-wash` | `#FFF6E9` | external feeds zone fill |
| `dao-wash` | `#F3EEFF` | DAO zone fill |
| `dao-ink` | `#6B4DCB` | DAO accent (purple = human authority) |
| `danger` | `#E5484D` | trust-boundary / freeze accent |
| `paper` | `#FFFFFF` | node fill / canvas |
| `hair` | `#D8E0E8` | zone borders, dashed reads |

Canvas: `paper` background, 1px `hair` frame. Font: system UI; labels 14px/600, sublabels 11px/400 `ink-soft`, zone titles 12px/700 letter-spaced, uppercase, `fill` = zone accent.

### (a) ZONES — 4 dashed-border rounded panels (`rx=14`, 1.5px dashed `hair`, zone-wash fill, title top-left inside)

| Zone | x | y | w | h | fill | title |
|---|---|---|---|---|---|---|
| **Z1 EXTERNAL FEEDS** | 24 | 40 | 250 | 300 | `feed-wash` | "EXTERNAL FEEDS" (amber ink `#B07A1E`) |
| **Z2 OFF-CHAIN AGENT WORLD** | 300 | 40 | 300 | 480 | `agent-wash` | "OFF-CHAIN (untrusted)" (`ink-soft`) |
| **Z3 ON-CHAIN · SUI** | 624 | 40 | 420 | 480 | `sui-blue-wash` | "ON-CHAIN · SUI (trust root)" (`sui-blue`) |
| **Z4 DAO / HUMAN** | 1068 | 40 | 108 | 480 | `dao-wash` | "DAO" (`dao-ink`, rotate -90 if tight) |

### (b) NODES (all `rx=10`, `paper` fill, 1.5px stroke = node's accent; 2-line text: bold label + `ink-soft` sublabel)

| id | label | sublabel | zone | x | y | w | h | stroke |
|---|---|---|---|---|---|---|---|---|
| `pyth` | **Pyth** | signed price + conf | Z1 | 44 | 90 | 210 | 56 | amber `#B07A1E` |
| `deepbook` | **DeepBook CLOB** | L2 order book (mid) | Z1 | 44 | 180 | 210 | 56 | amber `#B07A1E` |
| `ml` | **ML model** | EWMA-Mahalanobis · 6-feat | Z2 | 320 | 96 | 260 | 60 | `ink` |
| `agent` | **Agent** | ratchet + send-gate · score→ParamRequest | Z2 | 320 | 196 | 260 | 64 | `sui-blue` |
| `keeper` | **Keeper** | model-free heartbeat · own key | Z2 | 320 | 320 | 260 | 60 | `ink-soft` |
| `policy` | **GuardianPolicy** | shared · corridor + caps + state | Z3 | 700 | 150 | 300 | 76 | `sui-blue` |
| `divmod` | **divergence::read** | re-derives div from raw Pyth+book | Z3 | 700 | 262 | 300 | 56 | `sui-blue` |
| `vault` | **Vault (consumer)** | borrow / withdraw — gated | Z3 | 700 | 356 | 300 | 60 | `ink` |
| `gov` | **GovernanceCap** | owned · separate object | Z4 | 1080 | 230 | 84 | 110 | `dao-ink` |
| `dash` | **Dashboard** | gauge · action log | Z2 | 320 | 432 | 260 | 56 | `ink-soft` |

> Place the **3-layer ladder inset** (d) inside Z3 at the bottom-right, x≈700 y≈438 w≈300 h≈70 — see (d).

### (c) EDGES — `from → to`, exact label, line style, route

Markers: define one `<marker id="arrow">` (solid `ink`), `id="arrow-blue"` (`sui-blue`), `id="arrow-danger"`. Line styles: **solid 2px = write/action**, **dashed 1.5px = read**, **solid 3px = trust-critical**. Labels: 10.5px, `paper` halo (`paint-order:stroke; stroke:#fff; stroke-width:3`) so they sit over zone fills.

| # | from → to | label | style | route hint |
|---|---|---|---|---|
| E1 | `pyth` → `ml` | "signed price feed" | dashed read, amber | Z1→Z2, into the model (the feeds' consumer) |
| E2 | `deepbook` → `ml` | "L2 book + CEX depth" | dashed read, amber | Z1→Z2, rises into the model |
| E3 | `ml` → `agent` | "0–100 score (advisory)" | solid 2px `ink` | within Z2, down |
| E4 | `agent` → `policy` | **"same-PTB: post Pyth + submit ParamRequest (sender-gated)"** | **solid 3px trust-critical `sui-blue`** | Z2→Z3, the hero edge; route across mid-canvas y≈196 |
| E5 | `keeper` → `policy` | "permissionless poke · 5 min" | solid 2px `sui-blue` | Z2→Z3, lower y≈330 |
| E6 | `policy` → `divmod` | **"reads price + L2 book ITSELF, re-derives divergence"** | **solid 3px trust-critical `sui-blue`** | within Z3, short down |
| E7 | `pyth` → `divmod` | "PriceInfoObject (same PTB)" | dashed read, amber | long curve Z1→Z3, route UNDER zones (y≈500) or top arc; keep faint |
| E8 | `deepbook` → `divmod` | "Pool L2 ticks (on-chain)" | dashed read, amber | parallel to E7 |
| E9 | `vault` → `policy` | "inline poke on borrow / withdraw" | solid 2px `ink` | within Z3, up-left |
| E10 | `gov` → `policy` | **"&GovernanceCap: unfreeze / set corridor / rotate agent"** | solid 2px `dao-ink` | Z4→Z3, left |
| E11 | `policy` → `dash` | "events → dashboard (queryEvents)" | dashed 1.5px `ink-soft` | Z3→Z2, long curve back to bottom-left |

> **Edge-routing note:** E7/E8 (feeds → on-chain re-derivation) are the visual proof that the chain reads raw data *itself*, not via the agent. Draw them as **faint amber dashed arcs that bypass the agent entirely** (route them along the bottom gutter y≈505 or a top arc y≈30), so the eye sees two independent paths into Z3: one through the agent (E4, thick), one direct (E7/E8, thin). This is the whole trust story in one glance.

### (d) 3-LAYER ENFORCEMENT — labeled ladder inset (bottom of Z3, or a standalone strip under the canvas at y≈438)

Three stacked bars, full width 290, each 20px tall, 4px gap, `rx=6`. Left edge color-coded by trust. Each bar: **layer name (bold) · who-pulls (right-aligned `ink-soft`)**.

| Rung | bar fill / left-rule | label (left) | who pulls (right) |
|---|---|---|---|
| **L1** | `paper` / `ink` rule | **L1 · Inline floor** — aborts borrow/withdraw if frozen or LTV/cap breached | *any borrow tx (agent-independent)* |
| **L2** | `sui-blue-wash` / `sui-blue` rule | **L2 · CAUTION** — clamp-and-log param tighten (max_ltv↓, borrow_cap↓) | *agent request, **clamped** — or contract-own tier* |
| **L3** | `#FBEAEA` / `danger` rule | **L3 · FREEZE** — halt borrow + withdraw | ***contract-only** (div ≥ T or book-not-ok); **DAO unfreezes*** |

Caption under ladder (10px `ink-soft`): *"one signal — Pyth↔DeepBook divergence — three rungs; trust level decides who pulls each."*

### (e) TRUST-BOUNDARY callout — a single bordered banner

A `danger`-stroked rounded pill (1.5px, `#FFF5F5` fill) spanning the seam between Z2 and Z3 (x≈590, y≈40, w≈70 vertical band OR a horizontal banner along the top at x≈300 w≈744 h≈26). Text, `danger` ink, 11px/700:

> **TRUST BOUNDARY** — agent can only push *safer* (one-way ratchet) · cannot hold the unfreeze cap · freeze is contract-only · its 0–100 score is advisory (event-only, never on the logic path)

Render this as the **top banner of the off-chain↔on-chain seam** (recommended: horizontal strip at `x=300 y=20 w=744 h=24`, above both zones) so it reads as the contract governing everything to its right.

### (f) LEGEND — bottom-left, under Z1 (x≈24, y≈356, w≈250, h≈150)

Small key, 11px rows, 14px swatches:

| swatch | meaning |
|---|---|
| ▬ solid 2px `ink`/`blue` | write / on-chain action |
| ┄ dashed 1.5px `hair` | read (no state change) |
| ▬▬ **solid 3px** | trust-critical path |
| ■ `sui-blue` | on-chain (trust root) |
| ■ `agent-wash` | off-chain (untrusted) |
| ■ `feed-wash` | external feed |
| ■ `dao-wash` / `dao-ink` | human / DAO authority |

### Build notes for the implementer

- One `<svg viewBox="0 0 1200 560" width="100%">`; group with `<g>` per zone for z-ordering: **zones first, then faint feed-arcs (E7/E8), then nodes, then primary edges, then labels, then the trust banner + ladder + legend on top.**
- Every node = a tiny `<Node x y w h label sub stroke/>` helper; every edge = `<Edge d=… style=… markerEnd=…/>` with a separate `<EdgeLabel>` placed at the path midpoint with the white-halo `paint-order` trick.
- The two **3px trust-critical edges (E4, E6)** and the **L3 `danger` rung** are the only visually "loud" elements — everything else stays quiet so the trust story pops in <10s.
- Coordinates above are a workable grid; nudge ±10px on render to clear label collisions (especially E4's long label across the Z2/Z3 seam and the E7/E8 bottom arcs).

**Source files backing this spec (absolute):** `/home/seawall/Architecture_ru.md`, `/home/seawall/packages/guardian/sources/{guardian,divergence,demo_vault,constants}.move`, `/home/seawall/docs/ABI.md`, `/home/seawall/packages/{agent,keeper}/src/*.ts`, `/home/seawall/packages/shared/src/constants.ts`.