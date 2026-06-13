# Seawall — Build Plan (from Architecture_ru.md, to June 21 testnet)

## TL;DR / critical path

**Seawall** is the architecture's three entities made real on Sui testnet: an **off-chain ML risk agent** (the `@seawall/agent` daemon — multi-source anomaly detector that proposes *safer-only* parameter changes), an **on-chain code-package** (the immutable `guardian` Move package + per-protocol `GuardianPolicy` shared object that re-derives the Pyth↔DeepBook divergence itself and is the sole executor of harm-moves), and a **lending protocol** (the `demo_vault` consumer whose `borrow`/`withdraw_collateral` run the inline floor). Plus an **off-chain keeper** that pokes the contract every 5 min so freeze/relax are agent-independent. The spine: *agent proposes (clamped) → contract re-derives + gates → only DAO loosens/unfreezes*. The critical path is **Move-first**: nothing else can be tested until the package compiles, the TS↔Move divergence parity is bit-for-bit, and the package is deployed with captured IDs.

**Day-by-day (all dates 2026, Pacific):**

| Day | Deliverable |
|---|---|
| **Jun 12** | Step 0: toolchain doc, v1/v2 split *proven* (install v2, `pnpm why`), guardian Move skeleton compiles, single Constants table (TS+Move) + parity stub. **Bank testnet gas.** |
| **Jun 13** | Step 1: full `guardian` package — `GuardianPolicy`, `compute_divergence`, `submit`/`poke`/`apply_`, governance fns, events; `sui move build` + unit tests green; **ABI frozen**. |
| **Jun 14** | Step 2: TS↔Move parity (V0–V4 + boundary vector) + **testnet deploy** + `create_policy` + capture IDs → `config/testnet.json` + same-PTB `poke` devInspect smoke + **live $0.764 anchor**. |
| **Jun 15** | Step 3: `demo_vault` + inline params-less `poke` on `borrow`+`withdraw_collateral` (writes+enforces, D5); vault tests (4 abort codes + calm-path); redeploy. |
| **Jun 16** | Step 4: `@seawall/agent` live loop — sources, warm-start, calibration, send-on-tighter-OR-5min, same-PTB `submit`, event readback. |
| **Jun 17** | Step 5: `@seawall/keeper` — params-less `poke` every 5 min, drift-free loop, `readPolicy`; verify on-chain FREEZE + drip-RELAX + `last_check`. |
| **Jun 18** | Step 6a: dashboard shell + gauge + ModelInternals + ActionLog + GovernancePanel against the live package/agent. |
| **Jun 19** | Step 6b: AttackPanel + 4 scenes + Scene-2 synthetic trace; dry-run; **bank per-scene fallback footage**. |
| **Jun 20** | Record + edit ≤5-min video; README + 1:1 logo + package ID; submit. |
| **Jun 21** | Reserve / polish (soft cutoff). |

**The one inviolate invariant** (the judge-named make-or-break): the agent can only ever move the system *safer*, bounded; the contract re-derives the breach from raw Pyth+DeepBook on **every** path and clamps the agent on **every** path; **FREEZE is contract-only**; only `&GovernanceCap` loosens or unfreezes.

---

## Architecture → components map

| Architecture rule / entity (`Architecture_ru.md`) | Where it's built |
|---|---|
| Off-chain ML agent: score + `max_ltv%`/`borrow_cap%`, send when tighter OR every 5 min, `Liq_buffer не трогаем` | `packages/agent` (Step 4); reuses `packages/model` `Detector` |
| Off-chain keeper: every 5 min params-less call to compute `div_own`, updates `last_check` | `packages/keeper` (Step 5) → calls `guardian::poke` |
| On-chain code-package: re-derive `div_own = f(divergence, depth)` w/ coin_decimal; `tighter_of(clamp(agent), clamp(onchain_own))`; instant-tighten/drip-relax | `packages/guardian/sources/{guardian,divergence,constants}.move` (Steps 1–2) |
| Freeze on `divergence ≥ X%` **OR book-not-ok (one-sided/empty)**, contract-only | `guardian::apply_` (Step 1) |
| Inline on `borrow`/`withdraw_collateral`, params-less, reject on freeze/params | `packages/guardian/sources/demo_vault.move` (Step 3) |
| Freeze exit DAO/owner only; DAO changes `[baseline; cap]` | `guardian::governance_unfreeze` / `governance_set_corridor` (`&GovernanceCap`) (Step 1) |
| Per-protocol isolation, own-policy-only auth | per-protocol `GuardianPolicy` instances, no registry; `cap.policy_id`/`registered_agent` asserts (Step 1) |
| `last_check` AND `last_change` | `GuardianPolicy` fields, written in `apply_` (Step 1) |
| Lending protocol (the consumer) | `demo_vault` (Step 3) + dashboard demo (Step 6) |
| AI risk score *for dashboard* (advisory, never on logic path) | gauge + ModelInternals read SSE + `RiskEvaluated.advisory_score` (Step 6) |

---

## Resolved design decisions (architecture-primary)

These resolve the tensions the reviews surfaced. **The architecture text wins; every deviation is recorded here.**

**D1 — `depth ≠ ok → freeze`: a STRUCTURAL book-usability check (RE-INSTATED per the builder's clarification).**
*Clarified by the builder:* "depth ≠ ok" means the book is **one-sided / empty / crashed (unusable)** — NOT "thin." That IS honestly implementable on the 1-tick/side testnet book: a 1-tick **two-sided** book is OK; only a missing/empty side is "not ok."
*Resolution (architecture-faithful):* `read_divergence` calls `get_level2_ticks_from_mid(1, clock)`; **either side empty/missing ⇒ `signal = BOOK_NOT_OK`**. The freeze predicate is the spec's two legs verbatim: **`div_own ≥ T` OR `signal == BOOK_NOT_OK` ⇒ `is_frozen = true`** (contract-only). NO `MIN_DEPTH` notional threshold (that is the part uncalibratable on a 1-tick book — and is NOT what the spec meant). *(Supersedes the earlier "CAUTION-on-loss-of-signal" softening: per the architecture + the builder, loss of a usable book FREEZES, and only DAO/owner unfreezes.)* Operational note: in the demo keep the injected book two-sided except in the scene that intentionally shows the book-not-ok freeze.

**D2 — One on-chain function "с параметрами либо без" → two entries (`submit` + `poke`).**
*Tension:* spec says ONE function, optional params. The build froze TWO entries.
*Resolution:* **`submit` (sender-gated, carries `ParamRequest` + `advisory_score`) and `poke` (permissionless, no params) both delegate to ONE internal `apply_(policy, &DivResult, Option<ParamRequest>, advisory_score, clock)`.** This is a faithful *encoding* of the spec's "optional params" (the spec under-specifies entry count) AND preserves the single re-derivation/clamp code path the auditor judge wants (no second path to drift). `submit` passes `Some(req)`; `poke` passes `None` (→ `apply_` uses `baseline` for the agent term = "выполняем без него"). The params-less-ness of `poke` is now a *type-level* guarantee — strictly more trust-minimized than `Option<None>`. **`poke(&mut policy, pio, pool, clock): DivResult` — the SINGLE permissionless params-less entry, called BOTH by the keeper (standalone tx, discards the return) AND by the vault's inline `borrow`/`withdraw_collateral` (uses the returned `DivResult.pyth_px` to value collateral). Inline ≡ keeper (D5).** **Audit gate: grep that both entries call the same `apply_` and nothing else mutates state.**

**D3 — Cadences: 5 min (keeper tick + agent heartbeat) vs 10 min (relax).**
*Resolution (no conflict — distinct timers):* `KEEPER_TICK_MS = AGENT_HEARTBEAT_MS = 300_000` (the loop period, spec's 5 min). `RELAX_COOLDOWN_MS = ALL_CLEAR_WINDOW_MS = 600_000` (spec's 10 min), enforced **on-chain** via `last_relax_ms`/`last_breach_ms`. Two consecutive 5-min ticks → at most one relax step (the second no-ops until cooldown elapses). Setting `all_clear_window == relax_cooldown` collapses the two gates to the spec's single "каждые 10 минут … если нет причин делать строже." The all-clear-window being a *separate* gate is a stricter-than-spec safety addition (slower to relax) — recorded.

**D4 — `last_check` / `last_change`.**
*Resolution:* `apply_` writes `last_check_ms = now` on **every** call (liveness heartbeat; the dashboard "stale guardian" alarm + the keeper's whole point depend on it) and `last_change_ms = now` **only** when `current` params moved or `paused` flipped (so the dashboard's "last action N min ago" + timeout calc read it). Plus `last_breach_ms`/`last_relax_ms` to drive the relax gate, and a monotone `epoch` for anti-replay/idempotency telemetry. Verbatim to "Помимо last_check необходимо фиксировать last_change."

**D5 — Inline call ≡ keeper call: the params-less path that WRITES GuardianPolicy (corrected per the builder).**
*Clarified by the builder:* the contract has exactly TWO call modes — **with params** (ML agent) and **without params** (used by BOTH the keeper AND the lending vault's inline `borrow`/`withdraw_collateral`). The inline call IS the same params-less call the keeper makes, and it **writes** into GuardianPolicy ("Результаты записываем … и используем").
*Resolution (architecture-faithful, supersedes the earlier read-only design):* `borrow`/`withdraw_collateral` take **`&mut GuardianPolicy`** and call the shared params-less **`evaluate(&mut policy, pio, pool, clock)`** — byte-identical to the keeper's path → it re-derives divergence in-tx and writes `is_frozen`/`current`/`last_check`/`last_change`. THEN the vault enforces the freshly-written state: abort if `is_frozen`, or if the post-action LTV exceeds the just-written `max_ltv_current`/`borrow_cap_current`. **No separate `D_INLINE` band** — inline ≡ keeper, exactly as the builder said; the loss-preventer is automatic because every borrow runs a FRESH evaluate (independent of keeper liveness). Safe-by-construction: the params-less path is monotone-toward-safe (can only tighten/freeze; relax only on the gated all-clear), so a permissionless/inline caller can't loosen anything — no authority bypass (must-fix #2 still holds: only `&GovernanceCap`-gated fns are off-limits to the public). Accepted tradeoff: `&mut` on the shared policy serializes borrowers via consensus — fine for the demo; the prod optimization is snapshot-then-enforce. **Call model:** `submit(Some(req))` [agent, sender-gated] vs `evaluate(None)` [keeper + inline lending, permissionless] → one shared `apply_`.

**D6 — `liquidate` vs `withdraw_collateral`.**
*Resolution (architecture-primary):* gate **`borrow` + `withdraw_collateral`** (the spec's two frozen actions). Do **NOT** gate `liquidate` — it is toward-safe, and freezing it would trap bad debt. The old `vault_floor_test` (which referenced `liquidate`) is rewritten for `withdraw_collateral`.

**D7 — `div_own = f(divergence, depth)`: depth STAYS (the builder pushed back — correctly).**
*Depth is NOT dropped.* It enters two ways: (1) **structurally in the freeze leg** (D1: empty/one-sided/crashed → `BOOK_NOT_OK` → `is_frozen`); (2) the **continuous param driver** is the divergence term below. A quantitative depth-severity nudge (thin best-level size / wide spread → tighter params) reads the level2 quantities and is included with a **flagged placeholder threshold for v1** (a real notional-depth severity needs depth history we don't have → conservative now, recalibrate post-mainnet). Net: divergence drives the continuous tighten; depth gates the freeze (exact) and nudges severity (placeholder).
*The DEFINED formula — pinned, identical on/off-chain, in `u128 @ 1e9`:*
```
pyth_1e9 = mul_div(price_mag, PRICE_SCALE, pow10(expo_mag))     // expo asserted negative; same expo applied to conf
dbk_1e9  = (base_dec >= quote_dec)                               // coin-decimal factor (must-fix #7, SIGN-CORRECTED)
           ? mid_raw * pow10(base_dec - quote_dec)              //   SUI(9)/DBUSDC(6) → ×10^3
           : mid_raw / pow10(quote_dec - base_dec)
mid_raw  = (bid_p[0] + ask_p[0]) / 2                             // ONLY if both sides non-empty
div_own  = mul_div(diff(pyth_1e9, dbk_1e9), PRICE_SCALE, pyth_1e9)   // |p−d|/p as fraction @1e9
signal   = (bid empty OR ask empty) ? BOOK_NOT_OK : NORMAL       // BOOK_NOT_OK ⇒ freeze (D1); div set 0, the freeze leg catches it
conf_frac= mul_div(conf_1e9, PRICE_SCALE, pyth_1e9)
```
The factor is **`10^(baseDec − quoteDec)`** (the must-fix #7 *literal* `10^(quote−base)` is sign-inverted → a 10⁶ error; **do not "fix" the code to match the literal**). The V0/V1 parity vectors (`dbk_1e9 == 764_000_000` = $0.764) are the guard. `mul_div` rounds down (u256 upcast, matches BigInt floor); operation order is multiply-then-divide on both sides.

---

## 0. Toolchain & layout & the v1/v2 split

**Goal.** Reproducible pinned toolchain, the v1/v2 `@mysten/sui` split made *structural and proven*, the `guardian` Move skeleton compiling, and the single Constants table (TS+Move) with a parity test — before any logic.

**Toolchain (verified live 2026-06-12).** Node **24.16.0** (`engines.node >=24` — `pyth-sui-js@3.0.0` requires `^24`), pnpm **11.5.2**, sui CLI **1.73.1-ff1fe0ec** at `/usr/local/bin/sui` (installed from prebuilt tarball, **not** `suiup` — document the real method). Move framework `rev` MUST match the CLI. Bump root `@types/node` to `^24` (minor #12). Record all in `docs/TOOLCHAIN.md`.

**The split (Path A), structural:**
- **Agent + keeper** → `@mysten/sui@^1.45.2` (v1; line tops out here) + `@pythnetwork/pyth-sui-js@3.0.0`. Client export is **`SuiClient`** (there is **no** `SuiJsonRpcClient` in v1). `queryEvents`/`devInspectTransactionBlock`/`signAndExecuteTransaction`/`getObject`/`getNormalizedMoveModule` all live on it.
- **Dashboard** → `@mysten/sui@2.17.0` (the `latest` tag) + `@mysten/dapp-kit@1.0.6` + `@mysten/deepbook-v3@^1.4.1` + `@tanstack/react-query@^5` + Vite. DeepBook maker-order injection (demo) lives here.
- **Shared** → `@seawall/shared` is pure TS (types/constants), **no `@mysten/sui` import** — the only thing both majors share.

**Sub-tasks.**
1. `docs/TOOLCHAIN.md`; root `package.json` `engines`/`packageManager`/`@types/node@^24`/scripts (`typecheck`, `move:build`).
2. Scaffold `packages/guardian/{sources,tests,scripts}` + `Move.toml` (below) + stub `guardian.move`/`constants.move`; `sui move build` exit 0.
3. Scaffold `packages/keeper` (v1) + `packages/dashboard` (v2) skeletons.
4. **Prove the split (correctness #4 — BLOCKING):** actually `pnpm add @mysten/deepbook-v3 @mysten/dapp-kit @mysten/sui@2.17.0` into `dashboard`, then `pnpm install` + `pnpm why @mysten/sui` → confirm **two distinct trees**: `1.45.2` reachable only from agent+keeper, `2.17.0` only from dashboard; **no v2 leaking into the agent**. The benign deepbook peer warning is expected. Do NOT declare the split "resolves" without this.
5. Constants table → `packages/shared/src/constants.ts` (TS) + `packages/guardian/sources/constants.move` (Move `public fun` getters) + `packages/shared/test/constants-parity.test.ts` (asserts `MAX_LTV.floor*100 === MAX_LTV_BPS.floor`, etc.) + a placeholder Move `constants_test.move`.
6. `packages/shared/src/ids.ts` — RESULTS.md snapshot IDs **with a loud "resolve live at startup, never freeze" comment**.

**`Move.toml` (lift verified-compiling probe deps):**
```toml
[package]
name = "guardian"
edition = "2024.beta"

[dependencies]
Pyth     = { git = "https://github.com/pyth-network/pyth-crosschain.git", subdir = "target_chains/sui/contracts", rev = "sui-contract-testnet" }
deepbook = { git = "https://github.com/MystenLabs/deepbookv3.git", subdir = "packages/deepbook", rev = "testnet-v19.0.0" }
# SHIPPED FORM: Pyth + deepbook only (lifts the de-risk probe). Wormhole + the Sui
# framework are pulled TRANSITIVELY via Pyth with no conflict (green guardian build
# proves it). Do NOT re-add an explicit Wormhole/Sui dep — it can duplicate-conflict.
# Pin revs to match CLI 1.73.1 on deploy day; commit Move.lock.

[addresses]
guardian = "0x0"
```
**Gotchas:** dep-key must equal package name (`deepbook` lowercase, else hard error in sui 1.73). Pyth/Wormhole branches float — commit `Move.lock`, re-pull HEADs deploy day. If an explicit `Sui` pin duplicate-conflicts with Pyth's transitive framework, drop it (probe form) and record the resolved rev.

**Acceptance gate.** `node/pnpm/sui --version` recorded; `pnpm why @mysten/sui` shows the proven two-tree split (#4); `cd packages/guardian && sui move build` exit 0; `pnpm -r typecheck` passes; constants parity test green; the table exists in exactly two places (TS+Move).
**Estimate.** ~0.75 day.

---

## Constants table (the single source of truth)

Pinned once in TS (`@seawall/shared`) and Move (`guardian::constants`), bound by the parity test. **Gauge bands, agent thresholds, and Move logic all import these symbols — never literals.** `[CHOSEN]` = sane demo placeholder, recalibrate against live book/backtest and update *this table only*.

| Constant | Value | Units | Source / rule |
|---|---|---|---|
| `MAX_LTV` (percent) | `{floor:55, baseline:75}` | % | ML reads percent |
| `BORROW_CAP` (percent) | `{floor:40, baseline:100}` | % | ML reads percent |
| `MAX_LTV_BPS` | `{floor:5500, baseline:7500}` | bps (u16) | on-chain corridor (percent×100) |
| `BORROW_CAP_BPS` | `{floor:4000, baseline:10000}` | bps (u16) | on-chain corridor |
| `PRICE_SCALE` | `1_000_000_000` | u128 @1e9 | == DeepBook `FLOAT_SCALING` |
| ~~`D_INLINE`~~ | — | — | **REMOVED (D5): inline ≡ keeper params-less `evaluate`; no separate inline band** |
| `D_CAUTION` | `10_000_000` `[CHOSEN]` | fraction @1e9 (1.0%) | L2 CAUTION onset / RELAX gate |
| `T_FREEZE` ("X%") | `50_000_000` | fraction @1e9 (5.0%) | L3 contract-only FREEZE. **>`D_INLINE` (D5/correctness #7)** |
| `CONF_FRAC_MAX` | `10_000_000` `[CHOSEN]` | fraction @1e9 (1.0%) | oracle-health / loss-of-signal gate |
| `MAX_AGE_SECS` | `60` | seconds | Pyth `get_price_no_older_than` (must-fix #7) |
| `TICKS` | `1` | u64 | `get_level2_ticks_from_mid(1, clock)`; **either side empty ⇒ `BOOK_NOT_OK` ⇒ freeze (D1, structural)** |
| `KEEPER_TICK_MS` | `300_000` | ms (5 min) | keeper loop |
| `AGENT_HEARTBEAT_MS` | `300_000` | ms (5 min) | agent heartbeat |
| `RELAX_COOLDOWN_MS` | `600_000` | ms (10 min) | min gap between relax steps (on-chain) |
| `ALL_CLEAR_WINDOW_MS` | `600_000` | ms (10 min) | quiet span before relax begins (= cooldown → spec's single interval, D3) |
| `RELAX_STEP_FRAC_BPS` | `1000` `[CHOSEN]` | bps frac (1e4=100%) | **DECIDED %-of-span:** per-param step = `mul_div(baseline−floor, 1000, 10000)` → max_ltv 200 bps / borrow_cap 600 bps per step (~10%/10min; both reopen in ~10 steps) |
| `BASE_DECIMALS` / `QUOTE_DECIMALS` | `9` / `6` | u8 | SUI / DBUSDC (must-fix #7) |
| `DBK_DECIMAL_RULE` | `base≥quote ⇒ raw·10^(base−quote)=×1000` | — | coin-decimal factor; live vector bid=760000/ask=768000→`764_000_000` |
| `BPS_DENOM` | `10_000` | u16 | LTV math denominator |
| `SCORE_LO` / `SCORE_HI` / `ALERT_SCORE` | `60` / `95` / `99` | score | gauge bands + score→param dead-band/floor |
| `SUBMIT_SCORE` | `99` `[CHOSEN]` | score | agent anti-spam throttle (NOT the send condition) |
| `LAMBDA_MEAN` / `LAMBDA_COV` | `0.99` / `0.99` | — | **single λ pair, used in BOTH live + backtest (minor #11)** |

**DELETED (do not implement in v1):** `MIN_DEPTH` / any notional-depth threshold (D1: "depth-not-ok" is STRUCTURAL — empty/one-sided side → freeze; a 1-tick **two-sided** book is OK); `D_INLINE` (D5: inline ≡ keeper, no separate band).
**Feed ids (resolve live, never freeze; assert):** beta SUI/USD = `0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266` (hermes-beta, live runtime); mainnet = `0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744` (Benchmarks, backtest history only). Each 404s on the other host.

---

## Step 1 — On-chain `guardian` package: `GuardianPolicy` + core `evaluate` (`div_own`, freeze, tighter_of, instant/drip, last_check/last_change)

**Goal.** The immutable `guardian` package: `GuardianPolicy` (shared) holding `PauseCap`+`ParamCap` internally and a DAO-set corridor; `GovernanceCap` (separate owned); the pure `compute_divergence`; `submit`/`poke` → one `apply_` (3-layer logic); governance fns; all events. `sui move build` + `sui move test` green → **ABI frozen**.

**Sub-tasks.**
1. **Scaffold** from the probe `Move.toml`; keep lowercase `deepbook` key.
2. **`constants.move`** — mirror the Constants table as `public fun` getters.
3. **Caps + structs (ABI FREEZE):** `PauseCap`/`ParamCap` (`has store`, embedded, module-private); `GovernanceCap has key, store { id, policy_id }` (separate owned); `ParamRequest has copy, drop { max_ltv_target_bps: u16, borrow_cap_target_bps: u16 }` + `new_param_request`. `GuardianPolicy` field set below.
4. **Factory + governance:** `create_policy(...)` → constructs caps inline, `share_object(policy)`, returns `GovernanceCap` to sender; asserts `floor ≤ baseline`. `governance_unfreeze`/`governance_set_corridor`/`governance_rotate_agent`, each `_: &GovernanceCap` as **2nd param** + `assert!(cap.policy_id == object::id(policy), EWrongGovernanceCap)`.
5. **`divergence.move`:** pure `compute_divergence(pyth_mag, expo_is_neg, expo_mag, conf_mag, bid_best, ask_best, bid_empty, ask_empty, base_dec, quote_dec): (u128 div, u128 pyth_px, u128 conf_frac, u8 signal)` (scalar, no objects — testable directly) + object wrapper `read_divergence<Base,Quote>(pool, pio, clock, feed_id, max_age): DivResult` (asserts feed id; reads Pyth + `get_level2_ticks_from_mid(TICKS, clock)`; **keep `pyth_px_1e9` public** — the vault values collateral with it, no TOCTOU).
6. **Entries + `apply_`:** `submit<Base,Quote>(policy, pio, pool, clock, req: ParamRequest, advisory_score: u8, ctx)` asserts `ctx.sender() == registered_agent`; `poke<Base,Quote>(policy, pio, pool, clock)` permissionless; both → `apply_(... Option<ParamRequest> ...)`.
7. **Tests:** `divergence_tests` (V0–V4 from shared `vectors.json`) + `enforcement_tests` (looser→`RequestRejected`/unchanged; over-tighten→`RequestClamped` to floor; `div≥T`+benign req→`paused=true`; RELAX blocked in-window + unfreeze-then-calm-poke→no relax; wrong-policy cap→`expected_failure`).

**`GuardianPolicy` (ABI FROZEN 2026-06-13 — canonical map in `docs/ABI.md`):**
```move
public struct GuardianPolicy has key {
    id: UID,
    owner: address,
    registered_agent: address,        // submit() sender-gate
    feed_id: vector<u8>,              // 32 RAW bytes (NOT hex string — minor #10); asserted every read
    expected_pool_id: ID,             // canonical DeepBook pool; asserted every read (trust-min linchpin, review fix)
    max_ltv_floor_bps: u16, max_ltv_baseline_bps: u16, max_ltv_current_bps: u16,
    borrow_cap_floor_bps: u16, borrow_cap_baseline_bps: u16, borrow_cap_current_bps: u16,
    threshold_t: u128, d_caution: u128, conf_frac_max: u128, max_age_secs: u64,  // 3 @1e9 u128s grouped (canonical)
    base_decimals: u8, quote_decimals: u8,
    paused: bool,
    last_breach_ms: u64, last_relax_ms: u64,
    all_clear_window_ms: u64, relax_cooldown_ms: u64, relax_step_frac_bps: u16,  // fraction of span (1e4=100%)
    last_check_ms: u64, last_change_ms: u64, epoch: u64,
    pause_cap: PauseCap, param_cap: ParamCap,
}
```
> **Step-1 adversarial-review (2026-06-13) fixes folded in:** `expected_pool_id`
> added (BLOCKER — permissionless `poke<Base,Quote>` previously let a caller pass
> a fake-calm/empty junk pool → fail-OPEN freeze-suppression or freeze-DoS; now
> `read_divergence` asserts `object::id(pool)==expected_pool_id` first). Also:
> `expo_mag<=18` bound in BOTH langs (u8-cast/pow safety + abort-parity);
> `create_policy` bounds (decimals<=18, thresholds<=PRICE_SCALE, relax step>=1);
> `governance_unfreeze` true no-op when not paused; `RequestRejected`/`Clamped`
> classified by the raw ask. Field order `conf_frac_max`/`max_age_secs` settled
> to the code's grouped order (the older sketch above had them swapped).

**`apply_` body (integers only):**
```
now = clock.timestamp_ms()
// FREEZE — contract-only, NO agent term; spec's TWO legs (D1): divergence OR book-not-ok
if (!paused && (d.div >= threshold_t || d.signal == BOOK_NOT_OK)) { paused = true; changed = true; emit Frozen{div, cause: if (d.signal == BOOK_NOT_OK) 1 else 0} }
// contract-own tighten (agent-independent), DISCRETE 3-tier over [d_caution, T]:
contract_target = onchain_own(d.div, d.signal, d_caution, threshold_t, corridors)
// L2 CAUTION — clamp-and-log, NEVER abort:
for p in {max_ltv, borrow_cap}:
    a = match agent_req { Some(r) => clamp(r[p], floor[p], baseline[p]), None => baseline[p] }
    c = clamp(contract_target[p], floor[p], baseline[p])
    target = min(a, c)                                   // tighter_of (lower bps = safer)
    if target < current[p] { current[p] = target; changed = true }            // INSTANT tighten, ratchet
    else if target > current[p] {                                              // would loosen → gated RELAX
        if (!paused && now-last_breach_ms >= all_clear_window_ms
            && now-last_relax_ms >= relax_cooldown_ms && d.div < d_caution && d.signal == NORMAL) {
            step = mul_div(baseline[p] - floor[p], relax_step_frac_bps, BPS_DENOM);  // %-of-span (DECIDED): max_ltv 200 / borrow_cap 600
            current[p] = min(min(current[p] + step, target), baseline[p]); last_relax_ms = now; changed = true }
    }
    if (agent_req is Some && clamp(r[p]) != current[p]) emit RequestClamped / RequestRejected
if (d.div >= d_caution || d.signal != NORMAL) last_breach_ms = now
last_check_ms = now                                      // ALWAYS (D4)
if (changed) last_change_ms = now
epoch += 1
emit RiskEvaluated{ advisory_score, div_own:d.div, signal:d.signal, paused,
                    max_ltv_current_bps, borrow_cap_current_bps,
                    max_ltv_requested_bps, borrow_cap_requested_bps, ts_ms:now }
```

**Frameworks & exact APIs (source-verified).** `std::u128::{mul_div /*round-down, u256 upcast*/, diff, pow, max, min}` (`sui::math` DEPRECATED). Pyth: `get_price_no_older_than(pio, clock, max_age_secs)` (no `PythState` arg; staleness in SECONDS, internal); `price::{get_price:I64, get_expo:I64, get_conf:u64, get_timestamp:u64-secs}`; `i64::{get_is_negative, get_magnitude_if_negative}`; feed-id assert via `price_info::get_price_info_from_price_info_object` → `price_identifier::get_bytes` (bare 64-hex, no `0x`). DeepBook: `get_level2_ticks_from_mid<Base,Quote>(self, ticks: u64, clock: &Clock)` (3 args, abort-free, returns 4 vectors; empty side → empty vector). **NEVER `pool::mid_price`** (aborts `EEmptyOrderbook`). Auth = `ctx.sender()` address gate (no in-Move ed25519).

**Files.** CREATE `packages/guardian/sources/{constants,divergence,guardian}.move`, `tests/{divergence_tests,enforcement_tests}.move`, `tests/vectors.json` (shared with the TS reference).

**How it honors the architecture.** Re-derives `div_own` on-chain on every path (D7); `tighter_of(clamp(agent), clamp(onchain_own))` with `None→baseline` = "выполняем без agent_req"; instant-tighten/drip-relax; FREEZE contract-only; `last_check`+`last_change`; `Liq_buffer` absent (untunable); governance `&GovernanceCap`-gated; per-protocol instances.

**Gotchas.** advisory_score appears ONLY in `emit` (grep-gate). No `mid_price`, no `update_single_price_feed`. Coin-decimal `×10^(base−quote)` (NOT the must-fix #7 literal). Expo applied to price AND conf; assert expo negative. `mul_div` not `mul_div_ceil`. Both entries call one `apply_` (D2 grep-gate).

**Acceptance gate.** `sui move build` exit 0 (one harmless Pyth doc warning OK); `sui move test` green (V0–V4 + enforcement); grep gates pass; struct layout reviewed → **ABI frozen** (downstream binds via `getNormalizedMoveModule`).
**Estimate.** ~1.5–2 days (long pole = unit normalization in `divergence.move`).

---

## Step 2 — TS↔Move parity for `div_own`/coin_decimal + testnet deploy + capture IDs

> ## ✅ STEP 2 DONE (2026-06-13) — package `0x30fcf67d…db4307` live on testnet
> GATE 1 (parity) ✅ — `divergence_tests.move` pins the exact `vectors.json` literals (V0–V7/M1–M4/E1–E4), TS suite green. GATE 2 ✅ — same-PTB `updatePriceFeeds → poke()` devInspect = **success** against the deployed package; **live anchor `div_own ≈ 0.05%`** (Pyth↔DeepBook agree → ×10³ coin-decimal sign physically right). GATE 2b ✅ — mis-bound `poke` → **`EWrongPool`** (the Step-1 blocker fix proven on-chain). IDs in `config/testnet.json`; `GuardianPolicy 0x7eabcfeb…`, `GovernanceCap 0xe06793f5…`. **Two deployment gotchas hit + fixed (see `docs/TOOLCHAIN.md`):** (1) Pyth has TWO testnet deployments — must post to State `0x243759…` (package `0xabf837e9`, what the Move build compiles against), NOT the de-risk snapshot's `0xd3e79c` (→ pio TypeMismatch); `ids.ts` corrected. (2) the live `SUI_DBUSDC` pool disabled DeepBook's latest upgrade `0x74cd5657` that Sui auto-links — **vendored** v19 deepbook at `packages/guardian/vendor/deepbook` with `published-at = 0x22be4cad` (the pool-allowed version) to pin the linkage. Deploy/create/gate driver: `packages/agent/scripts/deploy.ts` (loads the deployer key at runtime via `sui keytool export`, never hardcoded). ~0.27 SUI spent; 0.82 left.

**Goal.** Prove the Move `compute_divergence` is **bit-for-bit** identical to the TS `@seawall/shared` reference on shared vectors (incl. the sign-corrected coin-decimal factor), then **deploy to testnet**, run `create_policy`, capture every ID into `config/testnet.json`, and confirm a same-PTB `updatePriceFeeds → poke()` devInspect succeeds against the *deployed* package.

**Sub-tasks.**
1. **Pre-flight (do first — external latency):** `sui client faucet` until `sui client gas` ≥ ~1 SUI; confirm `Move.lock` Sui rev.
2. **Vectors** `packages/shared/tests/vectors.json` (raw integers, expected `bigint`): **V0** equal prices → `0n`; **V1** `bid=760000,ask=768000,base=9,quote=6` → `dbk_1e9 = 764_000_000n` ($0.764, the sign test); **V2** one-sided/both-empty → CAUTION sentinel (not `0n`); **V3** ~5% → `50_000_000n`; **V3b boundary** a divergence that truncates (e.g. `49_999_999.x` → `49_999_999`) — proves floor-vs-round parity (correctness #5); **V4** negative-expo + conf same expo branch.
3. **TS side first:** `pnpm test packages/shared` green (Step 1 owns `divergence.ts`; this step consumes it). TS `mulDiv(x,y,z)=(x*y)/z` multiply-then-divide, pure BigInt, no `Number()`.
4. **Move parity** `packages/guardian/tests/divergence_parity_test.move` — call `compute_divergence` with the **exact** `vectors.json` integers; assert V0=`0`, V1=`764_000_000`, V3=`50_000_000`, V3b boundary, V2 sentinel, V4. **GATE 1.**
5. **Deploy:** `sui move build`; `sui client publish --json` → capture `packageId`.
6. **`create_policy` PTB:** corridor `5500/7500`, `4000/10000`; `feed_id` = **32 raw bytes** of the beta id (hex-decode, NOT the hex string — minor #10); **`expected_pool_id` = the live SUI_DBUSDC pool object id (resolve from the SDK, never freeze — the trust-min linchpin; asserted on every read)**; `registered_agent` = agent address; `threshold_t=50_000_000`, `d_caution=10_000_000`, `conf_frac_max=10_000_000`, `max_age_secs=60`; relax knobs; `base/quote_decimals=9/6`. Capture `policyId`, `governanceCapId`.
7. **Write `config/testnet.json`** (`packageId`, `policyId`, `governanceCapId`, `vaultId` empty until Step 3); commit + `Move.lock`. Leave Pyth/Wormhole/pool/feed to runtime resolution.
8. **Smoke (GATE 2):** adapt the de-risk spike — hermes-beta `getPriceFeedsUpdateData([beta])` → `SuiPythClient.updatePriceFeeds(tx, data, [beta])` → `tx.moveCall(${packageId}::guardian::poke, typeArguments:[SUI, DBUSDC], arguments:[policyId, pio[0], poolId, '0x6'])` → `devInspectTransactionBlock` → `status: success`, no `EWrongFeed`.
9. **Live anchor:** log normalized DeepBook ref ≈ `760–768_000_000` (≈$0.76) against a live hermes-beta ~$0.74 quote — the decimal sign is *physically* right, not just self-consistently green.
10. **Pool-binding negative proof (GATE 2b — the blocker-fix integration test):** `poke` with a DIFFERENT pool object (any non-canonical `&Pool`) must devInspect-FAIL with `EWrongPool` (divergence code 4). This is the on-chain witness that the unit-tested pool binding actually fires through the object path (the unit suite can't construct a `&Pool`).

**CRITICAL — resolve the Pyth State ID live (correctness #1).** The RESULTS.md snapshot `0xd3e79c…ddc0` and RECON's `0x243759…1c7c` disagree; one is the package, one is the State. **Do NOT trust either hardcoded value.** Resolve `pythStateId`/`wormholeStateId` from `@pythnetwork/pyth-sui-js` (or Pyth's testnet `contracts.json`) at startup and **prove via the GATE-2 devInspect** that `updatePriceFeeds` succeeds before treating any ID as canonical. This is the single most likely silent deploy-day failure.

**Frameworks.** `std::u128::mul_div` (round-down) vs `mul_div_ceil` (separate — avoid). `@pythnetwork/pyth-sui-js@3.0.0` same-PTB flow. `@mysten/sui@1.45.2` `SuiClient`. `typeArguments` mandatory on every generic call.

**Files.** CREATE `packages/guardian/tests/divergence_parity_test.move`, `config/testnet.json`, `packages/guardian/scripts/{deploy.ts,smoke-poke.ts}`. COMMIT `Move.lock`.

**How it honors the architecture.** This is the literal "функцию предстоит уточнить" pinned + proven (D7); GATE 2 proves the *deployed* contract re-derives from raw Pyth+DeepBook in one PTB (the judge make-or-break); honors anti-rot "resolve live, never freeze."

**Gotchas.** No gas → deploy half blocked (do parity first). Coin-decimal sign (V1 is the discriminator — don't "fix" to the must-fix #7 literal). `mul_div` floor on both sides. Feed-id 32 raw bytes. devInspect ≠ execution (capture IDs from the real publish). Pyth/Wormhole revs float — commit `Move.lock`.

**Acceptance gate.** GATE 1 (parity green, exact literals) **AND** GATE 2 (deploy + IDs captured + same-PTB `poke` devInspect success + live anchor sane). A green test without the live anchor does NOT count.
**Estimate.** ~1 day.

---

## Step 3 — Demo lending vault + Layer-1 inline floor (`borrow` + `withdraw_collateral`)

> ## ✅ STEP 3 DONE (2026-06-13) — `demo_vault` live; Layer-1 inline floor proven end-to-end on testnet
> `demo_vault.move` shipped (`DemoVault<phantom Quote, phantom Base>`; `borrow`/`withdraw_collateral` run the SAME params-less `guardian::poke` the keeper calls → re-derive divergence + write is_frozen/current → enforce, fail-CLOSED; `deposit`/`repay` ungated). 75 Move tests (10 new vault: calm both-hooks, EPolicyMismatch, EFrozen ×div+×book, ELtvExceeded ×borrow+×withdraw, EBorrowCapExceeded, deposit/repay-ungated-while-frozen, collateral-value anchor) + 60 TS, typecheck clean. **Redeployed (package `0x2635919f…653ad`, +demo_vault), created+funded a vault, and proved on the DEPLOYED package:** GATE 3 ✅ — same-PTB `updatePriceFeeds → borrow()` devInspect = success (the inline floor ran `poke` reading live Pyth+DeepBook, enforced LTV, emitted `VaultAction`); GATE 3b ✅ — over-borrow → `ELtvExceeded` (demo_vault code 3) in `enforce_solvency`. IDs in `config/testnet.json` (`DemoVault 0xf9b3b69e…`). Added `base_decimals`/`quote_decimals` getters to guardian (additive, the plan's "getters if missing"). ~0.4 SUI spent total, 0.61 left. **NEXT = Step 4** (off-chain ML agent → `submit`). Note: each new module → new package id; `config/testnet.json` is canonical.

**Goal.** `DemoVault<phantom Quote, Base>` + the always-on, agent-independent inline path: on `borrow`/`withdraw_collateral`, call the params-less **`poke(&mut policy,…): DivResult`** — the SAME entry the keeper calls (D5); it re-derives divergence in-tx and WRITES `is_frozen`/`current`, then the vault **aborts** (fail-CLOSED) on `is_frozen` (div≥T OR book-not-ok) / LTV-or-cap violation. Works with a dead agent AND a dead keeper (every borrow self-evaluates).

**Sub-tasks.**
1. **Confirm cross-module surface (HARD DEP — correctness #3/G7):** `guardian.move` exposes `public fun` getters `is_paused`, `max_ltv_current_bps`, `borrow_cap_current_bps`, `feed_id`, `max_age_secs`, `conf_frac_max`; `DivResult.pyth_px_1e9` is public. Add in Step 1 if missing.
2. **Decide (now):** `borrow_cap` = a second LTV-style bps fraction gate (`assert!(ltv_after ≤ borrow_cap_current_bps)`); debt = **counter-only + emit** (no `Coin<Quote>` mint; `withdraw_collateral` returns real `Coin<Base>`).
3. **`demo_vault.move`:** `DemoVault<phantom Quote, Base>` (Base **non-phantom** — `Balance<Base>`); `new_vault`/`deposit_collateral` (ungated); private `floor_check` (shared preamble); `borrow` (counter bump + emit); `withdraw_collateral` (`coin::from_balance(balance::split(...))`).
4. **`collateral_value_in_quote`** uses `DivResult.pyth_px_1e9` (no second Pyth read) + the coin-decimal factor. **Param gate as cross-multiply** (`debt * BPS_DENOM <= cap * coll_value`) to dodge rounding (correctness G9).
5. **Abort codes:** `EFrozen`, `ELtvExceeded`, `EBorrowCapExceeded`, `EPolicyMismatch` (no `EInlineFloorBreach` — freeze is now written by the inline `evaluate` and caught via `is_frozen`, D5).
6. **`vault_floor_test.move`** (for `withdraw_collateral`, NOT `liquidate`, D6): calm-path success (both hooks) + each abort (`EFrozen` via div≥T AND via book-not-ok, `ELtvExceeded`, `EBorrowCapExceeded`, `EPolicyMismatch`); use a `#[test_only]` `evaluate`/`floor_check` overload taking a pre-built `DivResult` + scalars (tests can't construct `&Pool`/`&PriceInfoObject`).
7. Redeploy; update `config/testnet.json` with `vaultId`.

**Inline-floor preamble (assert order):**
```move
assert!(object::id(policy) == vault.policy_id, EPolicyMismatch);
// inline ≡ keeper (D5): run the params-less evaluate — re-derives in-tx and WRITES is_frozen/current/last_check
let d = guardian::poke(policy, pio, pool, clock);               // &mut GuardianPolicy (== keeper's entry); returns DivResult for valuation
assert!(!guardian::is_paused(policy), EFrozen);                  // freeze just (re)written: div>=T OR book-not-ok (D1)
// value collateral with the SAME pyth_px (no 2nd read / no TOCTOU); cross-multiply gate vs the FRESH current corridor:
assert!(new_debt * BPS_DENOM <= (guardian::max_ltv_current_bps(policy) as u128) * coll_value, ELtvExceeded);
assert!(new_debt * BPS_DENOM <= (guardian::borrow_cap_current_bps(policy) as u128) * coll_value, EBorrowCapExceeded);
```

**Generic-order discipline (correctness #3 — BLOCKER).** `DemoVault<phantom Quote, Base>` → vault `moveCall`s use `typeArguments: [DBUSDC_TYPE, SUI_TYPE]` (Quote, Base). `poke`/`submit`/`read_divergence` are `<Base,Quote>` → `[SUI_TYPE, DBUSDC_TYPE]`. **These orders DIFFER — document loudly in the ABI doc; every caller (deploy script, agent, keeper, dashboard, tests) uses the declared order per function.**

**Frameworks.** `coin::{into_balance,from_balance}`, `balance::{join,split,value}`. **`&mut GuardianPolicy`** (inline runs the params-less `poke`, which writes — D5). Real `borrow` = same-PTB `updatePriceFeeds` + `moveCall` off-chain (the inline `poke` needs the fresh `&PriceInfoObject`).

**Files.** CREATE `packages/guardian/sources/demo_vault.move`, `tests/vault_floor_test.move`. EDIT `constants.move` (abort codes), `guardian.move` (getters if missing).

**How it honors the architecture.** Inline on `borrow`+`withdraw_collateral` runs the **params-less `poke` (== keeper call, D5)**, WRITES results to GuardianPolicy ("записываем … и используем"), then rejects on `is_frozen`/params; book-not-ok freezes (D1) fail-CLOSED; freeze restricts only the two harmful actions (`deposit`/`repay` ungated). Every borrow self-evaluates → protects even with a dead agent AND dead keeper.

**Gotchas.** `phantom` order (G1). Coin-decimal factor + single `pyth_px_1e9` from the inline `evaluate`'s `DivResult` (no 2nd Pyth read / no TOCTOU, G3/G4). Grep `demo_vault.move`: borrow/withdraw call `guardian::poke(&mut policy, …)` exactly once each; zero direct `pyth::get_price`/`update_single_price_feed`, zero `mid_price`. `borrow` amount = QUOTE minor units; `withdraw` amount = Base minor (MIST) — don't cross (G10).

**Acceptance gate.** `sui move build`/`test` green; all 5 abort codes + calm-path covered; grep gates pass; getters confirmed public; redeployed with `vaultId`.
**Estimate.** ~0.75–1 day.

---

## Step 4 — Off-chain ML agent (`@seawall/agent`): score+params, send-on-tighter-OR-5min, same-PTB Pyth, against the deployed ABI

> ## ✅ STEP 4 DONE (2026-06-13) — autonomous agent proven live; must-have #3 end-to-end
> The agent originates the on-chain CAUTION tighten with no human. Built TDD-first (16 pure-logic tests). Files (all in `packages/agent/src`): `policy-logic` (toBps/clamp/computeRequest/decideRequest one-way ratchet vs the on-chain APPLIED baseline/shouldSend) · `calibrate` (empirical-percentile, overall+solvency+liquidity) · `config` (loads config/testnet.json + key via `sui keytool export`, rejects mainnet feed) · `onchain` (policy snapshot = ratchet baseline) · `chainEvents` · `tx` (same-PTB updatePriceFeeds→new_param_request→submit; ABI verified on-chain via getNormalizedMoveModule; devInspect→execute→waitForTransaction) · `deepbook` (v1 devInspect+BCS book read, no v2 SDK) · `live` (pyth+deepbook+CEX+BTC row) · `warmup` (replay ~3h 1-min CEX history → prime Detector+FeatureBuilder, build calibrator) · `loop` (Engine: tick→features→score→calibrate→ratchet→send-gate→submit; scenes calm/elevate/malicious/dead) · `control-server` (SSE /stream, POST /control/scene, GET /feed-id) · `index` (warmup→interval+SIGINT, no half-tx). 76 TS + 75 Move, typecheck clean, agent single @mysten/sui v1.
> **Gates (live, deployed pkg):** GATE 4a — agent ORIGINATED max_ltv 7500→6000, advisory_score event-only & matches, hadRequest=true (must-have #3); 4b — malicious over-tight 1000/1000 clamped to floor 5500/4000, RequestClamped×2, never below floor (trust-min). GATE 5 — warmup (149 bars/89 calm samples) + CALM tick 0 tx + ELEVATE tick autonomously tightens to floor. Control plane: /healthz, /feed-id, scene POST→tick, bad-mode reject. Scripts: `scripts/{submit-smoke,loop-smoke}.ts`.
> **⚠️ Known calibration caveat (Step-6 tuning, NOT a blocker):** the warmup calm baseline is proxied on cross-CEX divergence (~0.05%) since there's no free historical DeepBook depth, but the LIVE pyth↔DeepBook divergence on testnet's thin DBUSDC pool runs ~0.3–0.5% (a real, persistent oracle↔CLOB offset — which the agent correctly flags). So the live calm solvency score runs hot (~100). Fix paths: warmup the divergence baseline on a matched signal (pyth-vs-CEX history) or a short live calm-bootstrap; for the demo, dramatic beats are scene-injected and the calm baseline is tunable. The agent LOGIC (ratchet/gate/submit/clamp) is correct and proven; only the calm-percentile scale is testnet-thin-pool-dependent. **Remaining Step-4 judge deliverable: `METHODOLOGY.md`** (the backtest harness + named metrics already exist in `backtest-lib.ts` + `events.ts` presets; the write-up is pending). **NEXT = Step 5** (keeper: 5-min params-less `poke`, freeze/relax independence — keeper has NO `@seawall/model`, confirmed).

**Goal.** A long-running TS daemon: tick ~3 s → live 7-feature vector → existing `Detector` → calibrated score + `ParamRequest` → send ONE same-PTB `submit` iff (clamped-tighter-than-on-chain-current OR 5-min heartbeat) → read back events. **Calm market = 0 tx.** Never decides on-chain.

**Sub-tasks.**
1. `config.ts` — env + validate; fail-fast if `packageId`/`policyId` unset or feed resolves to mainnet id.
2. `onchain.ts` — `OnChainParams` mirror via `getObject(policyId, {showContent:true})`, refresh every 30 s + after submit. **Authoritative ratchet baseline = `RiskEvaluated.applied_*` from events, NOT the request** (correctness #16).
3. `sources/live.ts` — reuse `sources/{pyth,cex}.ts` + new `deepbook.ts` → `asofJoin(60s grid, maxStaleMs=3×grid)`.
4. `deepbook.ts` — `get_level2_ticks_from_mid` via **v1 `devInspectTransactionBlock`** (NOT the v2 SDK; crib BCS decode from the verified de-risk spike). Empty/one-sided → loss-of-signal sentinel (not 0). Feeds **only the advisory score**.
5. `warmup.ts` — replay ~2–3 h of 1-min bars (CEX + Pyth Benchmarks **mainnet** history id) through `FeatureBuilder`+`Detector` to prime EWMA past warmup + build the calm-window d² reference.
6. `calibrate.ts` — empirical-percentile calibrator (mirrors `backtest-lib.ts`); the calibrated score feeds gate + `advisory_score` event + gauge (raw χ² saturates at ~100).
7. `loop.ts` — tick → features → `det.update` → calibrate (overall + groupD2 solvency/liquidity) → `scoreToParams(solv, liq)` → `ratchetRequest` → `toBps` clamp → **SEND gate** → on send `tx.ts`; always emit `AgentTick` (SSE).
8. `tx.ts` — same-PTB `updatePriceFeeds` + `submit`; **confirm the exact ABI via `getNormalizedMoveModule`** (pass `ParamRequest` as two `tx.pure.u16` or via `new_param_request` per the dump — never from prose); `advisory_score` separate `tx.pure.u8`; devInspect then execute.
9. `chainEvents.ts` — `queryEvents` on `guardian` for the log + `RiskEvaluated.applied_*` ratchet baseline + `RequestClamped`/`RequestRejected` ("malicious agent refused").
10. `rationale.ts` — LLM explainer, **default OFF**, display-only, never on tx path.
11. `index.ts` — `main()`: config → `SuiClient`+`Ed25519Keypair` → warmup → loop + SIGINT (no half-submitted tx) + error boundary.
12. `control-server.ts` (v1) — `GET /stream` (SSE), `POST /control/scene`, `GET /feed-id` (for the dashboard).

**SEND gate (architecture-faithful).** Send iff **(A)** `reqBps` strictly tighter than on-chain `current` for either param (`reqBps.maxLtv < current.maxLtv` OR `reqBps.borrowCap < current.borrowCap`) — the spec condition — **OR (B)** `now − lastSentMs ≥ 300_000` (heartbeat). `SUBMIT_SCORE`/`RESUBMIT_COOLDOWN_MS` are **additive anti-spam throttles on (A), NOT the send condition** (document so a reviewer never thinks the score gates the send — fidelity #2). The ~3 s tick is the *detector* cadence; the *send* cadence is decoupled.

**Frameworks.** `@mysten/sui@1.45.2` (`SuiClient`, single v1 copy — `pnpm why` gate), `@pythnetwork/pyth-sui-js@3.0.0`. **Construct `Detector` with explicit `lambdas:{mean:0.99, cov:0.99}` — the SAME λ as the backtest** (minor #11; or change `constants.ts` to `0.99/0.99` and re-run backtests — pick ONE λ, report that one). Reuse model verbatim: `Detector`, `scoreToParams(solvency, liquidity)`, `FeatureBuilder`, `asofJoin`. **Never import `@mysten/deepbook-v3`/`@mysten/dapp-kit`** (drags v2).

**Files.** EDIT `packages/agent/src/index.ts`. CREATE `config.ts, onchain.ts, sources/live.ts, deepbook.ts, warmup.ts, calibrate.ts, loop.ts, tx.ts, chainEvents.ts, rationale.ts, control-server.ts, util/retry.ts` + `.env.sample`. EDIT `packages/shared/src/constants.ts` (cadence/score consts).

**How it honors the architecture.** Send-on-tighter-OR-5min; outputs score + `{maxLtv,borrowCap}`; `Liq_buffer` untouchable (no field); one-way ratchet (never proposes looser than last applied); advisory score event-only; must-have #3 attribution = agent's `submit` ORIGINATES the CAUTION tighten; freeze contract-only.

**Gotchas.** **HARD UPSTREAM DEP:** Step 1 shared helpers (`toBps`/`ratchetRequest`/relocated `scoreToParams`) + Step 3 deploy (real `packageId`/`policyId`, frozen ABI) must land first. Bind to the **deployed `submit` ABI via `getNormalizedMoveModule`**, never prose (the component contract's `evaluate(Option,sig,vault)` shape is superseded). Calibrated score, not raw χ². Loss-of-signal → score escalates, never 0. Object-version contention on the shared policy → retry next tick (correctness #6).

**Acceptance gate.** `pnpm why @mysten/sui` = one v1 copy; warmup completes; calm → 0 submissions; forced elevated → exactly ONE PTB (devInspect success then execute, `RiskEvaluated` lands); event readback `advisory_score == calibrated score`; on clamp, `RequestClamped` fires + `lastApplied` updates from the event; SIGINT mid-tick → no half-tx.
**Estimate.** ~1.5 days.

---

## Step 5 — Off-chain keeper (`@seawall/keeper`): 5-min params-less `poke` + autonomous freeze + 10-min drip-relax

**Goal.** A separate, near-stateless v1 process that calls the permissionless `poke<Base,Quote>(policy, pio, pool, clock)` every 5 min in one same-PTB-Pyth tx. All FREEZE/contract-own-tighten/drip-RELAX/`last_check`/`last_change` decisions happen **on-chain inside `poke`**; the keeper supplies only scheduling + a fresh price + observability. **Must NOT import `@seawall/model`** (freeze cannot depend on ML — load-bearing for the trust pitch).

**Sub-tasks.**
1. Scaffold `packages/keeper` (v1 deps; **no `@seawall/model`**).
2. `config.ts` — read live IDs from `config/testnet.json`; resolve `feedId` live + assert it equals `policy.feed_id`; `typeArgs = [SUI, DBUSDC]` (poke is `<Base,Quote>`).
3. `tx.ts` — `appendPythUpdate` (shared/byte-identical to the agent's Pyth-poster).
4. `buildTickTx()` — `updatePriceFeeds` then `tx.moveCall(${packageId}::guardian::poke, typeArguments:[SUI,DBUSDC], arguments:[policyId, pio[0], poolId, '0x6'])`. **No `req`/`advisory_score`/`ticks`.** Verify arg list via `getNormalizedMoveModule` at boot.
5. `tick()` — devInspect pre-flight → `signAndExecuteTransaction` → parse `RiskEvaluated`/`Frozen` into `lastObserved`; on failure increment `consecutiveFailures`, log, don't crash (missed tick is safe — fail-CLOSED).
6. `schedule.ts` — drift-free `everyMs(300_000, tick)` (recompute deadline from a fixed epoch, not naive `setInterval`); fire once on boot.
7. `readPolicy()` — `getObject` → `PolicySnapshot` (for dashboard "stale guardian" alarm `now − last_check > 2×tick` + "last action N min ago").
8. `index.ts` — throwaway keeper keypair (gas-only, NOT the agent's `registered_agent` key — must work from any key to prove permissionlessness); structured per-tick log.

**Frameworks.** `@mysten/sui@1.45.2` (`SuiClient`) + `pyth-sui-js@3.0.0`; hermes-**beta**. `queryEvents` for readback.

**Files.** CREATE `packages/keeper/{package.json,tsconfig.json,src/{index,keeper,tx,schedule,config,types}.ts}`.

**How it honors the architecture.** Every-5-min params-less `poke` = "вызывает функцию … без параметров … last_check"; FREEZE/relax decided on-chain (zero keeper influence — a malicious keeper only chooses *when* to poke a deterministic fn); drip-RELAX gated on stored on-chain all-clear (keeper death → no relax → fail-CLOSED); no unfreeze surface (DAO-only); permissionless (identity gas-only).

**Gotchas.** Same-PTB Pyth (must-fix #1 — `poke` aborts on stale `pio`). Bind to `poke`, NOT `evaluate(none)` (the `Option`-single-entry was superseded; params-less is now type-level). `typeArguments` mandatory. **Always execute even on no-op** (`last_check` liveness is part of the safety story; testnet gas is free). Object-version contention with the agent's `submit` → retry. Beta feed id. Drift-free scheduler over a long demo. v1-pure (no deepbook-v3/dapp-kit).

**Acceptance gate.** `pnpm build` passes; `pnpm why @mysten/sui` = one v1; `@seawall/model` absent from keeper tree; `getNormalizedMoveModule` confirms `poke(policy,pio,pool,clock)` + 2 type params (abort with clear error if drifted); live `tick()` executes, `RiskEvaluated` (+ `Frozen` on injected breach) readable; calm tick still advances `last_check`; ±2 s interval over 30 min; killed tick recovers; **fail-closed proof:** kill keeper during injected divergence → no relax/loosening, inline floor still aborts an unsafe borrow.
**Estimate.** ~0.75 day.

---

## Step 6 — Dashboard + 4-scene testnet demo + ≤5-min video

**Goal.** A Vite + React SPA (`@mysten/dapp-kit@1.0.6`, v2) that makes the architecture visible: live gauge (bands bound to Constants), ML model-internals (must-have #2), polled on-chain action log (must-have #3), `&GovernanceCap` DAO-override (must-have #4), attack panel. Then orchestrate + record the 4-scene testnet demo ≤5 min.

**Sub-tasks.**
0. **Prereq gate (BLOCKING):** `getNormalizedMoveModule(guardian)` → dump to `src/contract/abi.json`; bind to **deployed** names, not prose.
1. `src/contract/abi.ts` — FROZEN event shapes (`RiskEvaluated`, `RequestClamped`/`RequestRejected`, `Frozen`/`Unfrozen`) + `GuardianPolicy` content layout. **`u128`/`u64` arrive as decimal strings → `BigInt()` before any compare** (correctness gotcha).
2. Scaffold Vite v2 workspace; install `@mysten/dapp-kit@1.0.6 @mysten/sui@^2.17.0 @tanstack/react-query@^5 react-gauge-component recharts`.
3. Provider shell: `QueryClientProvider → SuiClientProvider → WalletProvider autoConnect → App`; import `@mysten/dapp-kit/dist/index.css`; `<ConnectButton/>`.
4. `config.ts` — IDs from `config/testnet.json`; feed id streamed from agent `/feed-id` (reject mainnet); Constants from `@seawall/shared`.
5. `RiskGauge.tsx` — `subArcs` bound to `SCORE_LO`/`SCORE_HI`; `ALERT_SCORE=99` tick labeled "measurement marker, not the gate"; reads the **calibrated** score off SSE.
6. `ModelInternals.tsx` (must-have #2) — (a) d² vs χ²(k) line + `ReferenceLine`; (b) per-feature contribution bars (the Scene-2 joint-anomaly proof); (c) EWMA μ sparklines; (d) `current` vs `[floor,baseline]` bars (read **on-chain bps**, not the request).
7. `ActionLog.tsx` (must-have #3) — `useSuiClientQuery('queryEvents', {MoveModule:{package,module:'guardian'}}, {refetchInterval:2000})`; rows show advisory score + applied params + tighten/relax; `RequestClamped`/`RequestRejected` styled as the trust-min money shot; explorer-linked digests (`https://suiscan.xyz/testnet/tx/<digest>`). **Also poll `demo_vault` module** for `VaultAction` (or emit it from `guardian`) so Scene-3 inline-floor beats show (minor #13).
8. `GovernancePanel.tsx` (must-have #4) — `useSignAndExecuteTransaction`; `tx.moveCall({target:${PKG}::guardian::governance_unfreeze, arguments:[tx.object(POLICY_ID), tx.object(GOVERNANCE_CAP_ID), tx.object('0x6')]})` (**name from the abi.json dump**, not prose); button disabled unless the connected wallet owns the `GovernanceCap` (via `getOwnedObjects`).
9. `AttackPanel.tsx` — POST to the agent's `/control/scene` (NOT frontend signing): fast de-peg / slow drift / malicious agent / dead agent.
10. `Timer.tsx` + `LayerStatus.tsx` — three distinct layer lamps; CAUTION (amber, agent-attributed) and FROZEN (red, **no agent attribution**) as separate widgets (must-fix #3).
11. Scene-2 synthetic joint-anomaly trace → `packages/agent/scenes/scene2.json`; label on-screen "accelerated replay of the detector on a slow-drift trace"; pair with the *separate* static real-backtest chart (don't conflate).
12. Playwright hero frames; `DEMO_SCRIPT.md` + dry-run + record; YouTube unlisted; README + 1:1 logo + package ID.

**must-have #3 attribution beat (CRITICAL).** The demo MUST show a narrated, digest-linked beat where the **agent's `submit` PTB lands and on-chain `current` visibly tightens** (Scene 1 CAUTION or Scene 2) — else the AI reads as an overlay. Narrate: "the agent ORIGINATES this tighten; the contract clamps direction+magnitude, never initiates."

**"One block" honesty (correctness #6).** Agent CAUTION (`submit`) and contract freeze (`poke`) are TWO separate txs on the same shared object — necessarily different checkpoints. **Re-narrate the timer as "seconds apart / consecutive blocks," NOT "agent-tighten and freeze in one block"** (the auditor judge catches the bluff). The "one block" pitch applies to the *single-PTB* post-Pyth-+-re-derive-+-act inside ONE tx, which is true.

**Frameworks.** dapp-kit **classic hooks** (`useSuiClientQuery`, `useSignAndExecuteTransaction`, `useCurrentAccount`) — **NOT** the newer `@mysten/dapp-kit-react`/`useDAppKit` that context7 now serves (drift flag — won't resolve against 1.0.6). **v2 client (verified 2026-06-12): the DeepBook injection / any standalone v2 script uses `SuiJsonRpcClient` + `getJsonRpcFullnodeUrl` from `@mysten/sui/jsonRpc` — v1's `SuiClient`/`getFullnodeUrl` are GONE in v2 (see TOOLCHAIN.md); `DeepBookClient({client,address,network:'testnet'})`.** `react-gauge-component` `subArcs` (`limit`=upper bound, last omits `limit`); verify `labels.tickLabels.ticks` API for the ALERT_SCORE marker (minor #14). recharts `^2`.

**Files.** CREATE `packages/dashboard/*`, `packages/agent/src/control-server.ts`, `packages/agent/scenes/scene2.json`, `{DEMO_SCRIPT.md, README.md, assets/logo-1x1.png}`.

**How it honors the architecture.** Score is display-only (never on tx path); ActionLog surfaces `tighter_of`/clamp/ratchet; GovernancePanel = DAO-only unfreeze (owned cap, 2nd arg); FROZEN widget contract-only; Scene 3 = dead-agent-still-safe (L1 floor); attack panel hits a *separate* agent (replaceable/external); Timer = PTB-atomicity payoff.

**Gotchas.** dapp-kit version drift (classic hooks). v1/v2 isolation (dashboard imports only `@seawall/shared` + talks HTTP/SSE to the v1 agent). `parsedJson` decimal-string → `BigInt`. Calibrated score (not raw χ²). Feed id from `/feed-id`, reject mainnet. Gauge bands = imported symbols, never literals. Loss-of-signal renders amber CAUTION, not red freeze (D1). Scene-2 honesty. Wallet on testnet + holds `GovernanceCap` + pre-funded.

**Acceptance gate.** `pnpm --filter dashboard dev` serves; split clean; gauge + 4 ModelInternals panels + ActionLog live against the deployed package; Scene 1 (agent CAUTION tighten lands, digest-linked, AND independent contract `Frozen`, two distinct widgets); Scene 2 (CAUTION while univariate sub-threshold, d² crosses χ², no freeze); Scene 3 (`RequestRejected` + try-unfreeze fails + dead agent → L1 still aborts a borrow); Scene 4 (`governance_unfreeze` succeeds only from cap owner); real digests; ≤5:00 recorded, unlisted, README has package ID + 1:1 logo.
**Estimate.** ~2.5–3 days (long pole = orchestration + recording; bank Jun 19 fallback footage).

---

## Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Pyth State ID wrong (the two snapshots disagree) → same-PTB Pyth aborts | High | Blocker | Resolve live from SDK/contracts.json; prove via GATE-2 devInspect before canonizing (correctness #1) |
| R2 | No testnet gas at deploy | Med | Blocker | Faucet Jun 12, verify `sui client gas` before Step 2 |
| R3 | v1/v2 split leaks v2 into agent | Med | High | Install v2 + `pnpm why` as the FIRST Step-0 gate (correctness #4) |
| R4 | ABI drift between prose and deployed | Med | High | `getNormalizedMoveModule` dump is authoritative; agent/keeper/dashboard bind to it, abort on mismatch |
| R5 | Coin-decimal sign wrong → freeze always/never | Med | Blocker | V0/V1 parity vectors + live $0.764 anchor; don't "fix" to the must-fix #7 literal (D7) |
| R6 | Calibration off → gauge pinned / Scene 2 dead | Med | High | One calibrator feeds gate+event+gauge; warm-start builds calm reference; one λ pair in live+backtest |
| R7 | Generic type-arg order (vault `<Quote,Base>` vs poke `<Base,Quote>`) | Med | Blocker | Document both orders in the ABI doc; every caller uses the per-fn declared order (correctness #3) |
| R8 | Demo orchestration eats the timeline | Med | High | Bank per-scene fallback footage Jun 19; descope ladder below |
| R9 | Floating Pyth/Wormhole branch HEAD moves | Low | Med | Commit `Move.lock`; re-pull + re-pin commit on deploy day |
| R10 | Object-version contention (agent+keeper on one shared policy) | Low | Low | Retry next tick with fresh version; devInspect won't catch it (correctness #6) |
| R11 | July-31 cliff (JSON-RPC sunset / Hermes key / Pyth State migration) | Low (post-deadline) | — | Pin pre-migration IDs; note in README; irrelevant before Jun 21 + Demo Day |

---

## Descope / fallback ladder (cut from the bottom up; never cut past the floor)

1. **Scene-2 live → synthetic replay + static backtest chart** (keep the story; this is already the plan).
2. **ModelInternals (c) EWMA small-multiples** → drop.
3. **ModelInternals (b) contribution bars + (c)** → single d²-vs-χ² chart (keep at least one model-internals panel for must-have #2).
4. **Keeper as separate process → co-located timer in the agent process** (logic identical; pitched as separable).
5. **AttackPanel buttons → a scripted CLI** driving scenes (lose the polish, keep the beats).
6. **LLM rationale** → already default-OFF; stays off.

**The floor (NEVER cut):** deployed package with a public ID; the 3 must-have widgets (visible AI score / on-chain action log proving must-have #3 / DAO override); a digest-linked agent-CAUTION-tighten beat; a contract-only freeze beat; the ≤5-min video. Below this the entry fails ST1's hard must-haves.

---

## Submission checklist (coverage table)

| Requirement | Where satisfied | Status |
|---|---|---|
| Public GitHub repo | repo root + README | Jun 20 |
| Demo video ≤5 min (YouTube) | Step 6 record, unlisted | Jun 20 |
| Logo 1:1 | `assets/logo-1x1.png` | Jun 20 |
| Deploy to Sui testnet + package ID | Step 2 deploy → README | Jun 14 (ID), README Jun 20 |
| KYC for ≥1 member | noted in README; solo builder | track |
| No OFAC regions | noted | ✓ |
| **ST1 #1 live price feed** | hermes-beta SUI/USD in agent + same-PTB Pyth in `submit`/`poke`/`borrow` | Steps 2/4/5 |
| **ST1 #2 visible AI risk score + criteria** | gauge + ModelInternals (Mahalanobis d²/χ² + per-feature bars) + `METHODOLOGY.md` + backtests | Steps 4/6 |
| **ST1 #3 ≥1 autonomous on-chain action via Move policy object** | agent `submit` ORIGINATES the CAUTION tighten on `GuardianPolicy` (no human); contract-only freeze is the 2nd autonomous action | Steps 1/4/6 |
| **ST1 #4 human override** | `governance_unfreeze` via owned `&GovernanceCap`, DAO-only | Steps 1/6 |
| Rename "Sentinel" → "Seawall" | repo/package/logo/README | done in-repo |
| `METHODOLOGY.md` + backtests + measured error rate | `packages/agent` backtest harness → `docs/` | Step 4 |

**Judge-deliverable note (honesty rule):** name the prior art (Mahalanobis = Kritzman-Li Financial Turbulence; EWMA-cov = RiskMetrics) in `METHODOLOGY.md`; novelty = the *application* (oracle↔CLOB divergence as a trust-minimized on-chain breaker) + the *enforcement*, NOT the estimator. Publish detection-latency + false-positive metrics; demo the joint-anomaly catch (Scene 2). Frame vs Gauntlet/Chaos Labs as **trust-minimized** (contract re-derives + one-way ratchet), reference-only — **never claim their simulation infra**.
