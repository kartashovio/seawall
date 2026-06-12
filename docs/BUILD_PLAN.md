# Seawall — Build Plan (to June 21 testnet submission)

## TL;DR / critical path

**The spine.** The off-chain half (EWMA-Mahalanobis model, data adapters, backtests, judge docs) is **done and strong**; the on-chain half — a Move `guardian` package whose `evaluate()` *re-derives the Pyth↔DeepBook divergence itself* and enforces 3 layers (inline floor / agent-originated CAUTION clamp / contract-only FREEZE) — is **100% unbuilt** and is exactly what the track scores (must-have #3) and the judge named the make-or-break. In 9 calendar days, one builder must: pin a TS reference divergence → scaffold + freeze the Move ABI → prove it bit-for-bit against the TS → deploy to testnet → deploy the full 3-layer body + demo vault → point the live agent at the deployed ABI → wire the maker-order divergence injection → build the dashboard → record a ≤5-min video. The hard path is Move-first, deploy the real contract before the agent points at it, and hold June 19 as integration+buffer with banked fallback footage and June 21 as pure reserve. **Start KYC, the faucet, and a placeholder logo TODAY — they have external latency and are otherwise forgotten.**

**The two facts that will silently sink you if missed:** (1) the coin-decimal factor is `×10^(baseDec − quoteDec) = ×10³` for SUI/DBUSDC — must-fix #7's literal `10^(quoteDec−baseDec)` is **sign-inverted** (gives a 10⁶ error → FROZEN fires always-or-never); (2) the live SUI_DBUSDC book is **1 tick per side**, so loss-of-signal must drive CAUTION, never an instant freeze.

**Day-by-day calendar (all dates Pacific, deadline June 21):**

| Day | Focus | Gate |
|---|---|---|
| **Jun 12** (today) | Step 0 hygiene; Step 1 `shared/divergence.ts` + hand-verify decimal sign vs a live $0.74 quote; **START KYC; run faucet (bank gas); pick rename (done: "Seawall"); placeholder 1:1 logo** | `pnpm test` green; `sui move build` green on empty pkg; gas ≥ 1 SUI |
| **Jun 13** | Step 2 — Move scaffold + `GuardianPolicy` full field set + **FREEZE the ABI** (`evaluate` + `poke` both, with `&Pool<Base,Quote>` + `ParamRequest` + `advisory_score`) + minimal read-only `evaluate` that reads+emits | `sui move test` seed (div==0); ABI declared frozen |
| **Jun 14** | Step 3 — bit-for-bit parity test (**GATE**) + testnet deploy + capture IDs + same-PTB `devInspect` smoke | parity green; package + policy + cap IDs in config; smoke success |
| **Jun 15** | Step 5a — `divergence.move` + full 3-layer `evaluate` body + demo vault L1 floor + enforcement/vault Move tests | enforcement tests green; redeploy |
| **Jun 16** | Step 4 — live agent loop on v1 vs **deployed** ABI + **calibration shim** + event readback | calm market → 0 submits; forced elevation → 1 PTB lands |
| **Jun 17** | Step 5b — maker-order divergence injection (Scenes 1 & 2) wired; **FIRST true end-to-end** on testnet | all 4 scenes fire events visibly via `queryEvents` |
| **Jun 18** | Step 6a — dashboard (Vite SPA): gauge + model panels + action log + governance + attack panel | SPA serves; wallet connects; live data renders |
| **Jun 19** | **INTEGRATION + BUFFER** — dry-run all 4 scenes; **bank screen-recordings of each scene as fallback footage**; Playwright hero frames; fix slippage | each scene recorded once successfully |
| **Jun 20** | Record + edit ≤5-min video; upload YouTube unlisted; finalize README (package ID, link); final logo; flip repo public; confirm KYC; no-OFAC note. **SUBMIT.** | submission complete |
| **Jun 21** | Pure reserve | — |

**Repo split (ground truth):** TS monorepo is at **`/home/seawall`**; design docs + the throwaway de-risk probe are at **`/home/sui-overflow`**. The Move package goes at **`/home/seawall/packages/guardian`** so the agent's `@seawall/shared` import and the deploy config share one tree.

---

## 0. Toolchain, repo layout & the v1/v2 split

### Goal
A reproducible pnpm monorepo with the deliberate v1/v2 SDK split, a compiling `guardian` Move package wired to the exact pinned testnet deps, a startup config strategy that never freezes hex, and one canonical Constants table that every gauge band and Move threshold binds to.

### Sub-tasks (ordered)
1. **Assert toolchain:** Node `v24.x`, pnpm `11.5.2`, sui `1.73.1` (framework rev `718ae563a42fb4ba0d055588f81c704dcef58c25`). Pin via `suiup install sui@testnet` then `suiup default set sui@testnet-v1.73.1`. **CLI version and Move framework `rev` MUST match.**
2. **Confirm the existing root** (`/home/seawall`): `package.json` (private, `packageManager: pnpm@11.5.2`), `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.base.json`.
3. **esbuild build-approval (pnpm 11 quirk):** add `onlyBuiltDependencies: [esbuild]` to `pnpm-workspace.yaml` (pnpm 10+ moved this out of `package.json#pnpm`). Without it, `tsx`/`vitest`/`vite` install but esbuild's `postinstall` is skipped → "Cannot find module @esbuild/linux-x64" at first run.
4. **Confirm the 5 packages** with the split baked into each `package.json`: `shared` + `model` = pure TS (no Sui dep); `agent` = v1; `dashboard` (new) = v2; `guardian` = Move.
5. **Author `packages/guardian/Move.toml`** — copy the de-risk form verbatim (Pyth + deepbook only; Sui/Wormhole/std resolve transitively). **Commit `Move.lock`.**
6. **Constants:** `shared/src/constants.ts` is the single source; mirror the numbers in `guardian::constants`.
7. **Runtime config:** `config/testnet.json` holds ONLY deploy-written IDs; Pyth/Wormhole/DeepBook/feed-id resolve at startup. `.env` for RPC URL + keypair.
8. **`pnpm install` + `pnpm why @mysten/sui`** → one v1 copy (1.45.2, under agent + pyth), v2 (2.17.0) under dashboard. Then `sui move build`.

### Frameworks & exact APIs (pinned, verified live)
- **AGENT** → `@mysten/sui@^1.45.2` (v1; `@mysten/sui/client` exports **`SuiClient`** — NOT `SuiJsonRpcClient`) + `@pythnetwork/pyth-sui-js@3.0.0` (exports exactly `SuiPriceServiceConnection`, `SuiPythClient`; deps `@mysten/sui ^1.3.0` → pins v1). `save-exact=true` for these — `@mysten/sui` `latest` is now **2.17.0**; an unpinned install pulls v2 and breaks pyth-sui-js.
- **DASHBOARD** → `@mysten/dapp-kit@1.0.6` (peers `@mysten/sui ^2.16.2`) + `@mysten/deepbook-v3@^1.4.1` (peers `^2.17.0`) → both pull v2. **Ignore Context7's `SuiGrpcClient`/`$extend(deepbook())`/`@mysten/dapp-kit-react`/`createDAppKit` snippets** — those are next-gen for packages we are NOT pinning. Use the `DeepBookClient` class + classic `SuiClientProvider`/`WalletProvider` hooks.
- **MODEL/SHARED** → pure TS, no Sui dep (import-safe from both sides).

**`Move.toml` (the form that compiled — do NOT add explicit Sui/Wormhole/MoveStdlib blocks; a second declaration is a duplicate-dep failure):**
```toml
[package]
name = "guardian"
edition = "2024.beta"

[dependencies]
Pyth = { git = "https://github.com/pyth-network/pyth-crosschain.git", subdir = "target_chains/sui/contracts", rev = "sui-contract-testnet" }
deepbook = { git = "https://github.com/MystenLabs/deepbookv3.git", subdir = "packages/deepbook", rev = "testnet-v19.0.0" }

[addresses]
guardian = "0x0"
```
- Package key **`deepbook` must be lowercase** (hard error in sui 1.73.1); `Pyth` is capitalized (matches its package name).
- Pyth/Wormhole revs float; **commit `Move.lock`** (froze at Pyth `62c7a5bc…`, Wormhole `1b1cb69e…`, Sui `718ae563…`, deepbook `190ab8fd…`). On deploy day, re-pull HEADs in a scratch dir; adopt only if the parity test still passes, else keep the frozen commits (pin as explicit `rev=<sha>`).

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - 'packages/*'
onlyBuiltDependencies:
  - esbuild
```

**`config/testnet.json` (deploy-written ONLY):**
```jsonc
{
  "network": "testnet",
  "packageId": "",        // <- Step 3 deploy
  "policyId": "",         // <- shared GuardianPolicy
  "vaultId": "",          // <- demo vault
  "governanceCapId": "",  // <- owned GovernanceCap
  "balanceManagerId": ""  // <- maker-order injection (Step 5)
}
```
`loadConfig()` resolves at runtime (never frozen hex): Pyth/Wormhole **state IDs** + package from the SDK; **SUI/USD feed id** from the Hermes feed-list (assert beta `0x50c6…fea266`, **reject** mainnet `0x23d7…65744`); **DeepBook package + SUI_DBUSDC pool** from `@mysten/deepbook-v3` `utils/constants`. Deploy IDs from `config/testnet.json`. RPC + keypair from `.env`.

### Files
`/home/seawall/{package.json, pnpm-workspace.yaml, .npmrc, tsconfig.base.json, config/testnet.json}`; `/home/seawall/packages/guardian/{Move.toml, Move.lock, sources/}`; `/home/seawall/packages/dashboard/` (Step 6).

### Gotchas & must-fixes honored
- **#1:** config resolves Pyth/Wormhole **state** IDs at startup; `loadConfig()` enforces the **beta** feed-id, rejects mainnet.
- **#2:** layout reserves `GovernanceCap` as a separate owned object (ID in config, written at deploy).
- **#7:** the constants table is the one place TS and Move bind unit facts.
- **v1/v2 split:** a peer-dep warning installing deepbook-v3/dapp-kit alongside the agent's v1 is **expected, not a break.**

### Acceptance gate
1. `pnpm install` exits 0 (peer-warning acceptable). 2. `pnpm why @mysten/sui` → exactly one v1 (1.45.2) + v2 (2.17.0). 3. `node -e "import('@mysten/sui/client').then(m=>console.log('SuiClient' in m))"` → `true`. 4. `sui move build` in `packages/guardian` exits 0 (one harmless Pyth doc-comment warning). 5. `import { ... } from '@seawall/shared'` resolves from model + agent.

### Estimate
~0.5 day (mechanical; existing TS root is already set up).

---

## Constants & CAUTION map

**Single source of truth.** Lives in `/home/seawall/packages/shared/src/constants.ts` AND mirrored verbatim in `guardian::constants`. On-chain divergence magnitudes are **u128 @ 1e9**; params are **basis points**. The gauge bands and Move thresholds bind here — never to literals.

| Constant | Value | Units / scale | Binds to |
|---|---|---|---|
| **Divergence (all @ 1e9 fixed-point)** | | | |
| `d_inline` | `30_000_000` | fraction @1e9 (3.0%) | Layer-1 vault abort |
| `d_caution` | `10_000_000` | fraction @1e9 (1.0%) | Layer-2 onset / RELAX all-clear gate |
| `T` (FROZEN) | `50_000_000` | fraction @1e9 (5.0%) | Layer-3 contract-only HALT |
| divergence formula | `\|pyth − dbk_ref\| / pyth` | u128 @1e9; `dbk_ref`=(best_bid+best_ask)/2 from `get_level2_ticks_from_mid` | identical on/off-chain |
| empty/one-sided book | → **CAUTION** sentinel, never 0/NORMAL | — | must-fix #5 |
| **Oracle health (Layer-1)** | | | |
| `max_age_secs` | `60` | seconds (Pyth `get_timestamp` is SECONDS) | `get_price_no_older_than`; **stored in policy, not an `evaluate` arg** |
| `conf_frac_max` | `10_000_000` | conf/price fraction @1e9 (1.0%) | Layer-1 confidence abort |
| **Corridors (DAO-set, agent-uncontrollable)** | | | |
| `max_ltv` | floor `5500` / baseline `7500` | basis points (55% / 75%) | LOCKED |
| `borrow_cap` | floor `4000` / baseline `10000` | basis points (40% / 100%) | LOCKED |
| `liq_buffer` | **NOT agent-tunable** | — | DAO/contract-only (retroactive) |
| **Score → param map** (advisory; off the logic path) | | | |
| `SCORE_DEADBAND` (`SCORE_LO`) | `60` | 0–100 | below → target = baseline (nothing moves) |
| `SCORE_FLOOR_LOCK` (`SCORE_HI`) | `95` | 0–100 | at/above → target = floor |
| ramp 60→95 | logistic `f∈[0,1]`; `target = floor + f·(baseline−floor)` | — | smooth tighten |
| `ALERT_SCORE` / `ALERT_TICKS` | `99` / `2` | 0–100 / ticks | **measurement marker ONLY, not a gate** |
| **RELAX (recovery)** | | | |
| `relax_step_bps` | `1000` (~10% of range) | bps | toward baseline |
| `relax_cooldown_ms` | `600_000` | ms (10 min) | min between RELAX steps |
| `all_clear_window_ms` | `600_000` | ms (10 min) | sustained-clear before eligible |
| RELAX condition | `now−last_breach_ms ≥ all_clear_window` **AND** `now−last_relax_ms ≥ cooldown` **AND** fresh read `< d_caution` **AND** `!frozen` | — | agent silence → no relax |
| **Coin decimals (must-fix #7 — SIGN-CORRECTED)** | | | |
| `POOL_DECIMALS` | `{ base: 9, quote: 6 }` (SUI / DBUSDC) | — | factor = **`10^(baseDec − quoteDec)` = ×10³** |
| `FLOAT_SCALING` | `1_000_000_000` | DeepBook 1e9 | price normalization |
| **EWMA (reconcile doc to code)** | | | |
| `LAMBDA_MEAN` / `LAMBDA_COV` | **`0.99` / `0.99`** | — | backtests + methodology use 0.99; `constants.ts` defaults (0.97/0.94) are stale → bump CODE to 0.99 |

**Clamp law (Layer-2, the trust-min ratchet):** `applied[p] = tighter_of( clamp(agent_target[p], floor, baseline), contract_own_target[p] )` — a looser-than-current component is **rejected** (one-way ratchet); emit `RequestClamped`/`RequestRejected` when `requested ≠ applied`. **The advisory 0–100 score rides as an event field only — never on the logic path.**

**⚠️ Constants hygiene (minors to fix here, once):**
- `TAU = 90` in the shipped `constants.ts` **contradicts** the locked alert def (`score ≥ 99 for 2 ticks`). **Replace** `TAU` with `ALERT_SCORE = 99` + `ALERT_TICKS = 2`; the gauge alert mark imports `ALERT_SCORE`, never a literal.
- **EWMA λ mismatch (DIRECTION MATTERS — the commission got this backwards):** `constants.ts` DEFAULTS are `0.97`/`0.94` (RiskMetrics-daily), but `backtest-lib.ts:117` explicitly OVERRIDES to **`0.99`/`0.99`** — so the published lead-times AND `ml-methodology.md` (which already says 0.99) are CORRECT. **Fix the CODE, not the doc:** construct the live agent's `Detector` with `lambdas:{mean:0.99,cov:0.99}` (Step 4) and bump the `constants.ts` defaults to `0.99`, or live behavior won't reproduce the backtest. Do NOT touch METHODOLOGY.md's 0.99.
- The percent→bps boundary (`×100`) is an explicit tested function in `paramMap.ts`, applied ONLY at `tx.pure.u16` encoding (see Step 1 / #7 below).

---

## Step 1 — TS reference divergence + ParamRequest map (`@seawall/shared`)

### Goal
A pure-TS, float-free reference computing **exactly** what Move's `evaluate()` will: (a) canonical `|pyth − dbk_ref| / pyth` as `u128 @1e9` from raw integer oracle/book inputs; (b) the tighten-only `ParamRequest` projection + percent→bps conversion. This is the bit-for-bit oracle Step 3 mirrors.

### Scope clarification (prevents a real conflation bug)
Two distinct "divergences" — do NOT merge:
- **Model `div` feature** (`packages/model`, exists): `1e4·|ln(p_oracle) − ln(p_cexMedian)|` in **bps**, a float ML feature. Off-chain only. Untouched.
- **On-chain-parity divergence** (NEW, this step): `|pyth − dbk_ref| / pyth` as **`bigint` @1e9**, from raw integer fields. Pyth-vs-**DeepBook**. The ONLY thing that must be bit-for-bit with Move. Name it `divergence1e9` to keep them distinct.

### Sub-tasks (ordered)
1. **`divergence.ts`** — all `bigint`:
   - `pythToScaled1e9(priceMag, expoNeg, expoMag, confMag)`: apply Pyth I64+expo to **both** price and conf → `{ priceScaled, confScaled }` @1e9. Mirror Move's positive/negative expo branches; no float.
   - `dbkRefScaled1e9(bidP, askP, baseDec, quoteDec)`: `(bidP+askP)/2` (raw u64 @ FLOAT_SCALING), scale to 1e9 **and apply the coin-decimal factor in one integer step**. Returns a CAUTION sentinel (`null`) on empty/one-sided — **never 0**.
   - `divergence1e9(pythScaled, dbkScaled)`: `|pyth−dbk|·1e9 / pyth` via `mulDiv` (round-down).
   - `mulDiv(x,y,z) = (x*y)/z` (BigInt division truncates toward zero = floor for non-negatives; matches `std::u128::mul_div`).
2. **Coin-decimal — SIGN-CORRECTED (verified $0.764 vs the live fixture):**
   ```
   P_human = (p_dbk / FLOAT_SCALING) · 10^(baseDec − quoteDec)
   ```
   For SUI(base,9)/DBUSDC(quote,6): factor = `10^(9−6) = 10³`. Fixture mid `764000 → 764000/1e9 · 1000 = 0.764` ✓. The must-fix #7 literal `10^(6−9)=1e-3` gives `7.64e-7` (10⁶ error). Clean integer path (1e9 == FLOAT_SCALING, they cancel): `if (baseDec ≥ quoteDec) scaled = raw · 10^(baseDec−quoteDec) else scaled = mulDiv(raw, 1n, 10^(quoteDec−baseDec))`. Move branches identically.
3. **`paramMap.ts`** — score→ParamRequest + ratchet:
   - **Resolve the import cycle:** `model` already imports `@seawall/shared`. Move the 3 pure corridor fns (`scoreToFraction`, `paramFromScore`, `scoreToParams`) **into `shared`**, and have `model/src/score.ts` re-export them from shared. (~20 min refactor.)
   - `ratchetRequest(target, last) = { maxLtv: min(target.maxLtv, last.maxLtv), borrowCap: min(...) }` — never looser than last applied.
   - **`toBps(pct)` / range-assert** (`5500 ≤ maxLtvBps ≤ 7500`, `4000 ≤ borrowCapBps ≤ 10000`): the percent→bps `×100` conversion, an explicit tested function applied ONLY at PTB encode. Prevents sending `75` (percent) as a u16 bps = 0.75% = instant over-tighten.
4. **Tests** (`divergence.test.ts`, `paramMap.test.ts`) — the vectors Step 3 mirrors verbatim from a committed `vectors.json`.
5. Export from `shared/src/index.ts`.

### Frameworks & exact APIs
- **vitest `^2.1`**, **tsx `^4.19`**, TS `^5.6` (already installed). `pnpm test` = `vitest run`. No new deps — pure `bigint`.
- Move counterpart Step 3 mirrors: `std::u128::mul_div(x,y,z) = x*y/z` round-down (truncates; confirmed `move-stdlib macros.move:235` — **do NOT swap for `mul_div_ceil` after misreading the docstring**). `sui::math` DEPRECATED.

### Files
CREATE `/home/seawall/packages/shared/src/{divergence.ts, paramMap.ts}`; `/home/seawall/packages/shared/test/{divergence.test.ts, paramMap.test.ts}`; `/home/seawall/packages/shared/tests/vectors.json`. EDIT `/home/seawall/packages/shared/src/{index.ts, constants.ts}` (add `FLOAT_SCALING`, `SCALE_1E9`, `POOL_DECIMALS`, sentinel, `ALERT_SCORE/ALERT_TICKS`, drop `TAU`); `/home/seawall/packages/model/src/score.ts` (re-export the 3 fns from shared).

### Test vectors (Step 3's Move test mirrors EXACTLY)
- **V0 — div==0 on equal prices:** Pyth → `764_000_000` @1e9; DeepBook `bid=760000, ask=768000` → mid `764000` → `764_000_000`. Assert `divergence1e9 === 0n`.
- **V1 — live fixture:** `bid=760000n, ask=768000n, base=9, quote=6` → `dbkRefScaled1e9 === 764_000_000n`.
- **V2 — sentinel:** `bid=[], ask=[768000]` (one-sided) AND both empty → CAUTION sentinel, NOT 0.
- **V3 — large divergence crossing T:** Pyth `764_000_000` vs dbk `802_200_000` (~5%) → exact bigint ≈ `50_000_000`.
- **V4 — negative expo + conf scaling:** conf uses the same expo branch as price.
- **ParamRequest:** score 50 → `{75,100}` (baseline); 95 → `{55,40}` (floor); 80 → strictly between, monotone-decreasing. Ratchet: `({maxLtv:70}, last:65)→65`; `({60}, last:65)→60`.

### Gotchas & must-fixes honored
- **#5** empty/one-sided → CAUTION sentinel, never 0 (V2). **#7** I64 sign+magnitude branches; expo on **both** price and conf; FLOAT_SCALING 1e9; `mulDiv` round-down; **coin-decimal sign CORRECTED** to `10^(baseDec−quoteDec)`. **#3** map output is the `ParamRequest` tuple; score not used in `divergence.ts`. **#6** `divergence.ts` independent of the Mahalanobis model.
- All-`bigint`, no `Number`/float in `divergence.ts` (grep clean).

### Acceptance gate
`pnpm test` green incl. new files; model tests still pass (no cycle). `divergence1e9` returns `0n` on V0 and exact bigints on V1/V3/V4; sentinel on V2. **Hand-verify** the decimal sign produces `$0.764` against a live ~$0.74 Pyth quote (a green test against a wrong oracle is worthless).

### Estimate
~0.5 day. Risk: the model↔shared cycle (resolve by relocating the 3 fns) and bit-identical I64-expo/conf branches (the test vectors de-risk it).

---

## Step 2 — Move `guardian` scaffold + `GuardianPolicy` + ABI-freezing `evaluate()`/`poke()`

### Goal
Stand up the immutable `guardian` package with the full `GuardianPolicy` field set, cap design, event structs, and a minimal **read-only** `evaluate()` that asserts the feed id, reads Pyth + DeepBook, normalizes units, re-derives divergence, and **emits** (no state mutation). Freeze the ABI/struct layout Steps 3/4/5/6 bind to.

### ⚠️ ABI decision locked HERE (resolves blockers #2 and #8)
- **Two entry functions, both frozen now** (do NOT add the split later in Step 5 — that breaks Steps 3/4):
  - `submit<Base,Quote>(policy, pio, pool, clock, req: ParamRequest, advisory_score: u8)` — **sender-gated** (`ctx.sender() == policy.registered_agent`); originates the Layer-2 CAUTION tighten. *(In Step 2 the body is read-only + emit; the gate is dormant.)*
  - `poke<Base,Quote>(policy, pio, pool, clock)` — **permissionless** keeper; Layer-3 freeze + gated RELAX only (fires on on-chain data, not caller identity). No `req`.
- `max_age_secs` lives in **policy state**, NOT an `evaluate` arg (per-instance config, minimal call surface).
- `advisory_score` is a **separate `u8` arg**, surfaced only in the event → reinforces "score never on the logic path."

### Sub-tasks (ordered)
1. Scaffold at `/home/seawall/packages/guardian` (copy de-risk `Move.toml`+`Move.lock`, rename `guardian`, `guardian = "0x0"`).
2. `guardian::constants` — mirror the Constants table verbatim (u128@1e9 thresholds, bps corridors, `max_age_secs`, `conf_frac_max`, RELAX step/cooldown/window, `FLOAT_SCALING`, `BASE_DECIMALS=9`, `QUOTE_DECIMALS=6`, all `E*` abort codes). **Coin-decimal factor = `10^(BASE−QUOTE)` (CORRECTED).**
3. Cap structs: `PauseCap`/`ParamCap` (`has store`, held INSIDE policy); `GovernanceCap` (`has key, store`, SEPARATE owned object).
4. `GuardianPolicy` shared object, FULL field set (below), `has key`.
5. `ParamRequest` input struct + events `RiskEvaluated`, `RequestClamped`, `RequestRejected`, `Frozen`, `Unfrozen` (`has copy, drop`). **Emit all from the `guardian` module** so the dashboard's `MoveModule:'guardian'` filter catches everything (fixes minor #15).
6. `init` + `create_policy(...)` factory (DAO sets corridor + `feed_id` + `registered_agent`; `transfer::share_object(policy)`; `transfer` the `GovernanceCap` to deployer).
7. Minimal `submit`/`poke`: assert feed id **against `policy.feed_id`** (per-instance, NOT a module const — fixes #9), `get_price_no_older_than`, normalize Pyth I64+expo+conf → u128@1e9, `get_level2_ticks_from_mid(1, clock)` with empty/one-sided→CAUTION guard, `dbk_ref` with coin-decimal factor, re-derive divergence, emit `RiskEvaluated`. **Zero `policy` field writes.**
8. `math.move` (or `divergence.move`) — isolate the pure `compute_divergence(...)` so Step 3's parity test targets it directly.
9. Seed Move test: `divergence==0` on equal prices; one-sided→CAUTION sentinel.
10. `sui move build` + `sui move test` green.

### `GuardianPolicy` field set (ABI FREEZE — do not change after Step 3)
```move
public struct GuardianPolicy has key {
    id: UID,
    max_ltv_floor_bps: u16,     max_ltv_baseline_bps: u16,     max_ltv_current_bps: u16,
    borrow_cap_floor_bps: u16,  borrow_cap_baseline_bps: u16,  borrow_cap_current_bps: u16,
    threshold_t: u128,          // L3 FROZEN (u128 @1e9)
    d_caution: u128,            // L2 onset
    max_age_secs: u64,
    conf_frac_max: u128,        // @1e9
    last_breach_ms: u64,
    last_relax_ms: u64,
    all_clear_window_ms: u64,
    relax_cooldown_ms: u64,
    relax_step_bps: u16,
    registered_agent: address,  // submit() sender-gate (fixes #3 — Sui address, NOT ed25519 pubkey)
    feed_id: vector<u8>,        // expected SUI/USD BETA bytes; asserted in submit/poke
    base_decimals: u8,
    quote_decimals: u8,
    paused: bool,               // L3 frozen flag
    pause_cap: PauseCap,
    param_cap: ParamCap,
}
public struct ParamRequest has copy, drop { max_ltv_target_bps: u16, borrow_cap_target_bps: u16 }
// GovernanceCap { id: UID } created in create_policy, transfer'd to DAO; never stored in the struct.
```
Events: `RiskEvaluated { policy_id, advisory_score: u8, div_own: u128, signal: u8, max_ltv_applied_bps, borrow_cap_applied_bps, max_ltv_requested_bps, borrow_cap_requested_bps, frozen: bool, ts_ms }`; `RequestClamped/RequestRejected { policy_id, param: u8, requested_bps, applied_bps }`; `Frozen/Unfrozen { policy_id, div_own, ts_ms }`. In Step 2 `applied == current` (no mutation) — emit anyway to lock the shape.

### Frameworks & exact APIs (verified verbatim)
**Pyth (must-fix #1, #7):**
```move
let p = pyth::get_price_no_older_than(pio, clock, policy.max_age_secs); // SECONDS
let info = price_info::get_price_info_from_price_info_object(pio);
let id = price_identifier::get_bytes(&price_info::get_price_identifier(&info)); // bare 64-hex, NO 0x
assert!(id == policy.feed_id, EWrongFeed);   // beta x"50c67b...fea266", per-instance
// price::get_price(&p):I64  get_expo(&p):I64  get_conf(&p):u64  get_timestamp(&p):u64
// i64::get_is_negative / get_magnitude_if_positive / get_magnitude_if_negative -> u64 BEFORE math; expo on BOTH price+conf
```
**DeepBook (must-fix #5):**
```move
let (bid_p, _bq, ask_p, _aq) = pool.get_level2_ticks_from_mid(1, clock); // abort-free; ticks:u64 + clock:&Clock
// bid_p[0]=best bid (descending), ask_p[0]=best ask (ascending). NEVER pool.mid_price (aborts EEmptyOrderbook).
if (vector::is_empty(&bid_p) || vector::is_empty(&ask_p)) { signal = CAUTION_LOSS_OF_SIGNAL } // never div=0
```
Arithmetic via `std::u128::mul_div` (round-down; cite `macros.move:235`). Coin-decimal `×10^(BASE−QUOTE)`.

### Files
`/home/seawall/packages/guardian/{Move.toml, Move.lock}`; `sources/{guardian.move, constants.move, math.move}`; `tests/divergence_tests.move`.

### Gotchas & must-fixes honored
- **#1** `&PriceInfoObject` only; never `update_single_price_feed`; feed-id asserted against `policy.feed_id` (one source — fixes #9). **#2** `GovernanceCap` separate owned, `&GovernanceCap` as 2nd param to unfreeze/override (signatures written now, bodies in Step 5); `PauseCap`/`ParamCap` inside the shared policy. **#3** `advisory_score` separate arg, event-only. **#5** abort-free read + CAUTION sentinel. **#7** I64/expo/conf, `std::u128::mul_div`, **corrected** coin-decimal, equal-price div==0 seed.

### Acceptance gate
`sui move build` exits 0 (one harmless Pyth doc-comment warning). `sui move test` green: `div==0` on equal prices, one-sided→CAUTION sentinel. `submit`/`poke` compile with the frozen signatures; **zero** `policy` field writes (grep the body — reads + `event::emit` only). Struct layout reviewed → ABI declared frozen.

### Estimate
~1 day. Long pole: unit normalization in `math.move` (~half the day); the scaffold is mechanical (the probe proves the cross-module reads compile).

---

## Step 3 — Bit-for-bit Move parity test + testnet deploy gate

### Goal
Prove the Move divergence math is **bit-for-bit identical** to the Step-1 TS reference (the judge's "contract re-derives the breach"), then publish `guardian` to testnet and capture all IDs into config. The Move test suite is the **GATE** — nothing downstream proceeds until green and the deployed `submit()` returns the same divergence under `devInspect`.

### Sub-tasks (ordered)
1. Commit the shared `vectors.json` (raw inputs + expected `divergence_u128_1e9`) — read by BOTH the TS `vitest` parity test and the Move `#[test]`s, so a copy-paste mismatch is impossible. Vectors V0–V4 from Step 1.
2. Ensure `compute_divergence(pyth_mag, pyth_expo_neg, pyth_expo_mag, bid_best, ask_best, bid_empty, ask_empty, base_dec, quote_dec): (u128, u8 /*signal*/)` is a **pure, scalar** fn (no objects) — the object-reading wrapper extracts scalars then calls it. *(Parity tests can't construct `&Pool`/`&PriceInfoObject` in a `#[test]`.)*
3. One `#[test]` per vector, exact `u128` equality (no tolerance). `#[test, expected_failure]` ONLY for the Layer-1 inline-floor abort (`div ≥ d_inline` → `abort EInlineFloorBreach`). `submit`/`poke` CAUTION/FROZEN paths must NOT abort (clamp-and-log) → asserted by state/return.
4. **GATE:** `sui move build` → `sui move test`. Red ⇒ STOP. If TS and Move disagree, the TS is **not** automatically authoritative — re-derive by hand (coin-decimal sign + integer-division rounding-order are the usual culprits).
5. **Fund the deploy address** (currently **zero gas** — verified; a hard blocker): `sui client faucet`; confirm `sui client gas` ≥ 1 SUI. *(Do this Jun 12, not deploy day — faucets are flaky/rate-limited.)*
6. Re-confirm CLI `1.73.1` framework rev matches the lock; re-pull floating Pyth/Wormhole HEADs only if needed (adopt only if parity still green).
7. `sui client publish --gas-budget 500000000 --json > publish.out.json`; create `GuardianPolicy` (shared) + `GovernanceCap` (owned) via `init`/`create_policy`; capture package ID, policy ID, governanceCap ID, UpgradeCap.
8. Resolve live Pyth/Wormhole/DeepBook State + pool IDs at runtime; write all IDs into `config/testnet.json`.
9. **Deploy smoke:** PTB `SuiPythClient.updatePriceFeeds(tx, data, [SUI_FEED])` → `tx.moveCall(<pkg>::guardian::submit, [policy, pioId, pool, '0x6', req…], [SUI, DBUSDC])`; `devInspectTransactionBlock`; assert `status==success` AND the emitted `RiskEvaluated.div_own` equals the TS reference for the same live read. Negative test: wrong feed → `EWrongFeed`.

### Frameworks & exact APIs
CLI `sui 1.73.1`, env `testnet`. Deploy commands as above. TS smoke (agent v1):
```ts
const pio = await new SuiPythClient(client, PYTH_STATE, WORMHOLE_STATE)
  .updatePriceFeeds(tx, updates /*Buffer[]*/, [SUI_FEED]); // returns ObjectId[]
tx.moveCall({ target:`${PKG}::guardian::submit`, typeArguments:[SUI_TYPE, DBUSDC_TYPE],
  arguments:[tx.object(POLICY), tx.object(pio[0]), tx.object(POOL), tx.object('0x6'), /*ParamRequest + score*/] });
const r = await client.devInspectTransactionBlock({ sender, transactionBlock: tx });
```
**`ParamRequest` is a struct, not a primitive** (fixes #2): construct it with a `tx.moveCall(guardian::new_param_request, [tx.pure.u16(maxLtvBps), tx.pure.u16(borrowCapBps)])` returning a value passed into `submit` — OR flatten to two `tx.pure.u16` args. Decide here and have Steps 4/5 quote the **deployed** signature via `getNormalizedMoveModule`, not prose.

### Files
`/home/seawall/packages/guardian/tests/divergence_tests.move`; `tests/vectors.json` (shared with TS); `config/testnet.json` (written); `/home/seawall/packages/guardian/scripts/{deploy.sh, smoke-evaluate.mjs}`.

### Gotchas & must-fixes honored
- **#7** the whole point of the gate; V0 (`div==0`) is the guard — if not exactly 0, the **corrected** coin-decimal factor or I64/expo handling is wrong. Watch integer-division rounding-**order** (scale-then-divide identically both sides). **#5** `is_empty` guard before `[0]`; never `mid_price`; V2 tests it. **#1** smoke uses `updatePriceFeeds` off-chain; feed-id asserted inside; assert **beta** feed, NOT mainnet. **#2** `GovernanceCap` created + captured at publish (owned), even though `unfreeze` logic lands Step 5 — so config is complete and downstream IDs are stable. **#3** CAUTION/FROZEN are NOT `expected_failure`; only the inline-floor is.

### Acceptance gate
1. `sui move test` all-pass incl. V0/V1 matching the TS `vitest` parity on the same `vectors.json` (diff = none). 2. `publish` exit 0; `config/testnet.json` has non-placeholder package/policy/governanceCap/upgradeCap IDs. 3. Smoke `devInspect` success AND `RiskEvaluated.div_own` == TS reference for the live read. 4. Wrong-feed negative test → `EWrongFeed`.

### Estimate
~1 day (+0.5d buffer if floating HEADs moved or faucet slow). Conditional on Step 2's ABI frozen and Step 1 vectors existing.

---

## Step 4 — Live off-chain agent on v1 against the deployed ABI

### Goal
A long-running TS agent ticking every few seconds: build the live feature vector (Pyth hermes-beta + CEX + DeepBook depth), score with the existing `Detector`, and only when elevated submit ONE PTB (`updatePriceFeeds` + `tx.moveCall(submit, …)`) against the deployed ABI, then read back `RiskEvaluated`/`RequestClamped`. Steady state = 0 transactions.

### Sub-tasks (ordered)
1. **`config.ts`** — package/policy/pool/Pyth+Wormhole state ids, beta feed id, keypair, RPC, cadence, gate. Fail fast if package/policy ids unset.
2. **`sources/live.ts`** — Pyth live tick (reuse `fetchLatest`); CEX live spot (reuse `fetchOHLCV`, trailing ~2-min window, last close per venue → `disp`/`div`); DeepBook depth.
3. **`deepbook.ts`** — read `get_level2_ticks_from_mid<SUI,DBUSDC>` via **`SuiClient.devInspectTransactionBlock`** (v1, NOT deepbook-v3 which peers v2). Decode 4 BCS `vector<u64>` (crib from `derisk/agent/spike-deepbook.mjs`) → `imb`, `spread`, mid. Empty/one-sided → loss-of-signal flag (NOT 0).
4. **Startup feed-id resolution** — resolve the live beta id from `SuiPriceServiceConnection`; reject mainnet.
5. **`warmup.ts`** — backfill ~2–3h of 1-min bars (CEX + Pyth Benchmarks) through `FeatureBuilder` + `Detector.update()` to prime EWMA past `warmup`, AND build the **calm-window d² reference array**.
6. **`calibrate.ts`** — empirical-percentile over the calm d² array (mirror `backtest-lib.ts`'s `percentileFn`), applied to live `ScoreResult.d2`. **This is load-bearing:** `Detector.update()` returns a raw χ² CDF score (`d2ToScore`, `index.ts:80`) that pins at ~100 on heavy-tailed live features; the **calibrated percentile is the single score** that flows to (a) the submit gate, (b) the on-chain `advisory_score` event field, and (c) the dashboard gauge — or the three disagree and Scene 2 won't reproduce.
7. **`loop.ts`** — every `TICK_MS`: build `FeatureVector` → `det.update(fv)` → calibrated score → `paramsFor(score)` (ParamRequest, %) → **ratchet against the on-chain `last applied`** → gate (`score ≥ SUBMIT_SCORE` AND strictly tighter than last applied AND past `RESUBMIT_COOLDOWN_MS`).
8. **`rationale.ts`** — guarded LLM explainer; called ONLY after the submit decision, output used only for display/event text; default OFF (no key). Never on the decision path.
9. **`tx.ts`** — `SuiPythClient(client, pythStateId, wormholeStateId)`; `getPriceFeedsUpdateData([feedId])` → `updatePriceFeeds(tx, updates, [feedId])` → `pio[]` (assert exactly one); construct `ParamRequest` per the **deployed** ABI (struct constructor moveCall or flattened u16s); `tx.moveCall(submit, …, [SUI, DBUSDC])`. **`devInspect` first**, then `signAndExecuteTransaction({ showEvents: true })`. **Percent→bps via `toBps` at encode** (range-asserted).
10. **`chainEvents.ts`** — `SuiClient.queryEvents({ query: { MoveEventType: \`${pkg}::guardian::RiskEvaluated\` }, order:'descending', limit })`; also parse events from the submit result.
11. **`index.ts`** — replace the `export {}` stub with `main()`: load config → warm up → loop with SIGINT shutdown + top-level error boundary.
12. **`util/retry.ts`** — bounded exponential backoff; a failed tick logs+skips (never crashes); a failed submit does NOT advance "last applied" (retries next tick).

### Frameworks & exact APIs (verified live)
- v1 client = **`SuiClient`** from `@mysten/sui/client`; has `devInspectTransactionBlock`, `signAndExecuteTransaction`, `queryEvents`. `Transaction` from `@mysten/sui/transactions`; `Ed25519Keypair` from `@mysten/sui/keypairs/ed25519`.
- `@pythnetwork/pyth-sui-js`: `new SuiPriceServiceConnection("https://hermes-beta.pyth.network").getPriceFeedsUpdateData(ids): Promise<Buffer[]>`; `new SuiPythClient(client_v1, pythStateId, wormholeStateId)`; `updatePriceFeeds(tx, updates, feedIds): Promise<ObjectId[]>` — all in ONE PTB.
- DeepBook read (v1 devInspect — keeps the agent single-SDK; was live-verified bid 760000/ask 768000):
  ```ts
  tx.moveCall({ target:`${DBK_PKG}::pool::get_level2_ticks_from_mid`,
    arguments:[tx.object(POOL), tx.pure.u64(1n), tx.object('0x6')], typeArguments:[SUI_TYPE, DBUSDC_TYPE] });
  const r = await client.devInspectTransactionBlock({ sender, transactionBlock: tx }); // decode 4× vector<u64>
  ```
- Existing model API (reuse verbatim): `new Detector(featureList, { warmup, lambdas:{mean,cov} })`; `det.update(fv): ScoreResult`; `det.paramsFor(score): ParamRequest`; `FeatureBuilder(cfg).push(row)`. Live feature list `["disp","div","divvel","volvel","mktvol","imb","spread"]`.

### Files
EDIT `/home/seawall/packages/agent/src/index.ts`. CREATE `/home/seawall/packages/agent/src/{config.ts, sources/live.ts, deepbook.ts, warmup.ts, calibrate.ts, loop.ts, tx.ts, chainEvents.ts, rationale.ts, util/retry.ts}`; `.env.sample`. EDIT `/home/seawall/packages/shared/src/constants.ts` (add `SUBMIT_SCORE`, `TICK_MS`, `RESUBMIT_COOLDOWN_MS`, `WARMUP_HOURS`); `/home/seawall/packages/agent/package.json` (add `start: tsx src/index.ts`; no new runtime deps).

### Gotchas & must-fixes honored
- **Single-SDK agent:** NEVER import `@mysten/deepbook-v3`/`@mysten/dapp-kit` into the agent (drags v2 in). DeepBook read is devInspect-only.
- **#1** agent posts `updatePriceFeeds` then passes the returned pio into `submit` in the SAME tx; assert exactly one pio; feed-id assert is the contract's job.
- **Calibration (blocker-class):** the calibrated percentile is the only "score" downstream of `update()`.
- **#3 / #5** agent submits a tighten-only `ParamRequest` (`maxLtv↓`,`borrowCap↓`; no `liq_buffer`); raw score is advisory event-only; empty/one-sided DeepBook → loss-of-signal in the agent's own score, never 0.
- **#6** LLM rationale display-only.
- **Agent divergence is NOT on the freeze path (fixes #10):** the agent's DeepBook read feeds ONLY the advisory ML score. The freeze decision is 100% the contract's on-chain re-derivation. Never log/branch the agent's divergence as if it gates freeze.
- **Ratchet baseline (fixes #16):** the agent's `last applied` MUST come from the most recent `RiskEvaluated.applied_*` event, NOT from what it requested — or a clamp/reject diverges local state from chain.
- **ABI is frozen by Step 2/3:** match the deployed `submit` signature exactly (via `getNormalizedMoveModule`); do not redesign here.

### Acceptance gate
1. `pnpm why @mysten/sui` still one v1 copy. 2. `tsx src/index.ts` on testnet: warm-up completes, calm market → **0 submissions**. 3. Forced elevated score → exactly ONE PTB; `devInspect` success before execute; execute lands with a `RiskEvaluated` event. 4. `queryEvents` reads it back; advisory score == agent's calibrated score; a clamp emits `RequestClamped` and the agent logs `requested != applied`. 5. Killing a source → degraded tick, loop continues; killing the agent mid-run leaves no half-submitted tx. 6. Calm window stays below `SUBMIT_SCORE` (~1% single-tick false-alarm); a replayed drift window crosses it.

### Estimate
~1.5 days. Hard dependency: Step 3 deployed first (real package/policy id, frozen `submit` ABI). The calibration shim is the load-bearing correctness piece (~0.35d).

---

## Step 5 — Full 3-layer `evaluate` body + demo vault + divergence injection

### Goal
Flesh `submit`/`poke` into real 3-layer enforcement against the **already-frozen ABI** (no signature change), build a minimal demo lending vault whose `borrow`/`liquidate` carry the Layer-1 inline floor, and wire the maker-order divergence injection on the live SUI_DBUSDC pool (0 DEEP) — so all four demo scenes execute end-to-end.

### Sub-tasks (ordered)
1. **Lock `constants.move`** (mirror the Constants table; **corrected** coin-decimal `10^(BASE−QUOTE)`).
2. **`divergence.move`** — parity-critical `compute_divergence(pio, pool, clock, max_age): DivResult { div_u128_1e9, pyth_px_1e9, dbk_mid_1e9, signal }`, `signal ∈ {NORMAL, CAUTION_LOSS_OF_SIGNAL}`. This is what Step 3's parity test pins.
3. **3 layers in `submit`/`poke`:**
   - Assert feed-id (`policy.feed_id`). Note: `submit`/`poke` still run while frozen to emit telemetry, but never relax.
   - Compute `DivResult`.
   - **Layer 3 (FROZEN, contract-only):** `if (div_own ≥ T && two-sided) → paused=true; emit Frozen`. **Loss-of-signal does NOT instant-freeze** (fixes blocker #3) — it drives CAUTION; escalate to FROZEN only if sustained (≥N empty-side ticks via `last_breach_ms`); the clean freeze trigger is `div_own ≥ T` from a two-sided book. Agent `req` has zero influence here.
   - **Layer 2 (CAUTION, clamp-and-log — `submit` only):** `contract_own_target = contract_own_tighten(div_own, conf, staleness)` (monotone over `[d_caution, T]`); `applied[p] = tighter_of(clamp(req.target[p], floor, baseline), contract_own_target[p])`; one-way ratchet vs `current`; write `current`; emit `RequestClamped`/`RequestRejected` when `applied≠requested`. **Never abort.**
   - **Breach bookkeeping:** `if (div_own ≥ d_caution || loss-of-signal) last_breach_ms = now`.
   - **RELAX (gated, in `poke`):** `iff now−last_breach_ms ≥ ALL_CLEAR_WINDOW AND now−last_relax_ms ≥ COOLDOWN AND fresh div_own < d_caution AND !paused → relax one step; last_relax_ms = now`.
   - Emit `RiskEvaluated`.
4. **Governance fns (cap-gated, 2nd-param `&GovernanceCap`):** `unfreeze(policy, _: &GovernanceCap, clock)` (clears `paused`, sets `last_breach_ms = now` so no instant re-relax); `set_corridor(policy, _: &GovernanceCap, …)`; `register_agent(policy, _: &GovernanceCap, addr)`.
5. **`demo_vault.move`** — hand-write from `MystenLabs/sui/examples/move` (`object_balance` + `flash_lender`). Fields `collateral: Balance<SUI>`, `debt: u64`, `policy_id: ID`. `borrow`/`liquidate` carry **Layer-1 inline floor**: `compute_divergence` inline → `assert!(signal==NORMAL && div < d_inline && !stale && conf_ok, EInlineFloorBreach)` (fail-CLOSED) + `assert!(!policy.paused, EFrozen)`. Agent-independent — works even if the agent is dead.
6. **`inject.ts`** (v2 deepbook path, separate process) — create/fund a BalanceManager, place resting maker limit orders on SUI_DBUSDC `payWithDeep:false` to walk best bid/ask away from Pyth. Scene 1 = one big crossing batch (fast); Scene 2 = small repeated nudges each individually `< d_caution` (slow/episodic, the stateful proof). `expire_timestamp` = far future / `max_u64()`; **cancel explicitly between scenes** (deterministic state).
7. **Tests** (below).

### Frameworks & exact APIs (verified from source)
- DeepBook read in `evaluate` + vault floor: `pool.get_level2_ticks_from_mid(1, clock)` (abort-free; never `mid_price`).
- Pyth read + I64/expo/conf handling as Step 2. `std::u128::mul_div` (round-down). **Coin-decimal `×10^(BASE−QUOTE)`.**
- Maker order (TS, `@mysten/deepbook-v3@1.4.1`): `DeepBookContract.placeLimitOrder({ poolKey:'SUI_DBUSDC', balanceManagerKey, clientOrderId, price, quantity, isBid, payWithDeep:false })` → `(tx)=>void`. BalanceManager via `balance_manager::new` + `deposit<T>` + `generate_proof_as_owner`. IDs from the SDK `utils/constants.ts`.

### Files
EDIT `/home/seawall/packages/guardian/sources/{constants.move, guardian.move}`. CREATE `sources/{divergence.move, demo_vault.move}`; `tests/{divergence_parity_test.move, enforcement_test.move, vault_floor_test.move}`; `/home/seawall/packages/agent/src/inject.ts`. EDIT/confirm `/home/seawall/packages/shared/src/divergence.ts` matches the Move parity test.

### Gotchas & must-fixes honored
- **#1** feed-id asserted inside; never `update_single_price_feed`. **#2** `GovernanceCap` separate owned, 2nd param; audit every `public`/`entry` fn on the shared object is safe to call by anyone (that's *why* L2/RELAX are monotone-toward-safe; only UNFREEZE/`set_corridor`/`register_agent` are cap-gated). **#3** FROZEN contract-only; CAUTION clamp-and-log never abort; score event-only; must-have-#3 attribution = the **agent's PTB originates** the CAUTION tighten. **#5** abort-free read; loss-of-signal → CAUTION (NOT instant freeze). **#7** I64/expo/conf, `std::u128::mul_div`, **corrected** coin-decimal, TS-then-Move bit-for-bit div==0.

### Acceptance gate
- `sui move test` green; **`divergence_parity_test` matches `divergence.ts` bit-for-bit** on ≥3 vectors incl. the live `760000/768000` and equal-price→0.
- `enforcement_test`: (a) looser-than-current req → `RequestRejected`, `current` unchanged; (b) tighter-beyond-floor → `RequestClamped` to floor; (c) `div_own≥T` → `paused=true` with a benign/zero agent req (contract-only proof); (d) RELAX blocked while `now−last_breach_ms < window`, and `unfreeze` resets the clock (**add the explicit "unfreeze then immediate calm `poke` → NO relax" case** — fixes minor #13); (e) `unfreeze` without `&GovernanceCap` fails.
- `vault_floor_test`: `borrow` aborts `EInlineFloorBreach` on injected `div≥d_inline`, aborts `EFrozen` when paused, succeeds when calm.
- **Testnet:** redeploy; `inject.ts` Scene 1 → agent PTB → `RiskEvaluated`/`Frozen` visible via `queryEvents`; Scene 2 episodic → CAUTION tightens `current` while each tick's `div_own < d_caution`; malicious-agent PTB (bogus score=0 + loosen req) → `RequestRejected`, system safe; `unfreeze` with the owned `GovernanceCap` clears the freeze.

### Estimate
~2 days. Long pole: the must-fix-#7 unit work in `divergence.move` + parity (~0.5d). **Sequenced AHEAD of Step 4's agent** (deploy the real contract first, then point the agent at it).

---

## Step 6 — Dashboard + 4-scene demo + ≤5-min video

### Goal
A Vite + React SPA on `@mysten/dapp-kit@1.0.6` (v2): live risk gauge (bands bound to the Constants table), ML model-internals panels, on-chain action log (polled `queryEvents`), `&GovernanceCap` DAO-override button, attack panel — then orchestrate + record the 4-scene testnet demo as a ≤5-min YouTube video, rubric-mapped (Real-World 50% lead).

### Sub-tasks (ordered)
1. **Freeze the event/state read contract (BLOCKING PREREQ).** Pull the exact `RiskEvaluated`/`RequestClamped`/`RequestRejected`/`Frozen` field names + BCS types from the deployed package (`getNormalizedMoveModule`), plus the `GuardianPolicy` fallback layout, into `src/contract/abi.ts`. Do NOT invent field names.
2. **Scaffold** `pnpm create vite dashboard --template react-ts`; install `@mysten/dapp-kit@1.0.6`, `@mysten/sui@^2.17.0`, `@tanstack/react-query@^5`, `react-gauge-component`, `recharts`. **Vite, not Next** — kills SSR, sidesteps the `SuiClientProvider` + `--turbopack` break (#20505).
3. **Provider shell:** `QueryClientProvider` → `SuiClientProvider networks={{testnet}} defaultNetwork="testnet"` → `WalletProvider` → `App`. Import `@mysten/dapp-kit/dist/index.css` (else `ConnectButton` is unstyled).
4. **`src/config.ts`** — deployed `PACKAGE_ID`, `GUARDIAN_POLICY_ID`, `GOVERNANCE_CAP_ID`, `DEMO_VAULT_ID`, SUI/USD pio id, + the Constants object (T, d_caution, d_inline, corridors, score-map breakpoints). From the Step-3 deploy config; never hardcode hex.
5. **`RiskGauge.tsx`** (`react-gauge-component`) — sub-arcs bound to the score-map: 0–60 green (dead-band), 60–95 amber (logistic ramp), 95–100 red (floored); distinct **`ALERT_SCORE=99` tick mark** labeled "measurement marker, not the param gate." The gauge reads the **calibrated** score (Step 4).
6. **`ModelInternals.tsx`** (recharts) — (a) Mahalanobis d² vs χ²(k) threshold time series; (b) per-feature contribution bars `c_i` (Σc_i = d², surface the joint-anomaly term); (c) EWMA μ vs current x small-multiples; (d) live `max_ltv`/`borrow_cap` vs [floor, baseline] progress bars. This is must-have #2.
7. **`ActionLog.tsx`** — `useSuiClientQuery('queryEvents', { query: { MoveModule:{package, module:'guardian'} }, order:'descending', limit:50 }, { refetchInterval: 2000 })`; decode `parsedJson`; timeline of `RiskEvaluated` (score + applied), `RequestClamped`/`RequestRejected` (the trust-min money shot), `Frozen`/`Unfrozen`; rows link to the explorer. *(All events emit from the `guardian` module — fixes #15.)* Must-have #3.
8. **`GovernancePanel.tsx`** — `useSignAndExecuteTransaction`; `tx.moveCall(unfreeze, [tx.object(GUARDIAN_POLICY_ID), tx.object(GOVERNANCE_CAP_ID), tx.object('0x6')])`. Connected wallet must own the `GovernanceCap`. Must-have #4.
9. **`AttackPanel.tsx`** — buttons that hit the **agent's local control endpoint** (NOT frontend signing): (a) Fast de-peg, (b) Slow drift (Scene 2), (c) Malicious agent (bogus score=0 / loosen / try-unfreeze), (d) Dead agent. The agent owns the keypair + maker-order injection.
10. **`Timer.tsx`** — starts on injection, stops on first on-chain event for that scene: "manual freeze: hours / DAO vote: days / **Seawall: one block**."
11. **Scene-2 synthetic joint-anomaly trace** — generate offline with the existing `packages/model` Detector (correlated features drifting apart inside individual ranges), serialize `scenes/scene2.json`, agent replays on demand. **Label on-screen as "accelerated replay of the detector on a slow-drift trace"** and show the real multi-hour backtest lead-times as a static chart cited to `ml-backtest.md` — keep them distinct (conflating is an auditor-judge credibility hole).
12. **Visual layer separation** — CAUTION (Layer 2, agent-originated, amber) and FROZEN (Layer 3, contract-only, red banner) are **distinct widgets**; the freeze widget never shows agent attribution.
13. **Must-have #3 attribution beat (CRITICAL framing):** the demo MUST show a clean, narrated, **digest-linked** beat where the **agent's PTB lands and the on-chain `current` param visibly tightens** (Scene 1 CAUTION rung or Scene 2). If the only on-chain motion shown is the contract-only freeze, must-have #3 reads as "the contract is autonomous, not the agent."
14. **Playwright hero frames** — capture gauge mid-climb, Scene-2 contribution bars, a `RequestRejected` row, the freeze banner, DAO-unfreeze (README + thumbnails).
15. **`DEMO_SCRIPT.md`** + dry-run + record ≤5min → YouTube unlisted → README link. Map runtime to rubric.
16. **Submission assets** — 1:1 logo, public repo, package ID in README, KYC, no-OFAC.

### Frameworks & exact APIs
dapp-kit 1.0.6 **classic hooks** (`SuiClientProvider`, `WalletProvider`, `ConnectButton`, `useSuiClientQuery`, `useSignAndExecuteTransaction`, `useCurrentAccount`). v2 client method is still `queryEvents`. Gauge `subArcs` `limit`s bound to the imported Constants, never literals.

### Files
`/home/seawall/packages/dashboard/` (new Vite workspace): `src/main.tsx`, `src/App.tsx`, `src/config.ts`, `src/contract/abi.ts`, `src/components/{RiskGauge,ModelInternals,ActionLog,GovernancePanel,AttackPanel,Timer,LayerStatus}.tsx`, `src/hooks/{useEvents,usePolicyState,useAgentSse}.ts`. `/home/seawall/packages/agent/src/control-server.ts` (tiny HTTP/SSE; agent owns the keypair). `/home/seawall/packages/agent/scenes/scene2.json`. `/home/seawall/{DEMO_SCRIPT.md, README.md, assets/logo-1x1.png}`.

### Gotchas & must-fixes honored
- **#2** override passes `GOVERNANCE_CAP_ID` as a separate owned 2nd arg. **#3** Layer-2/Layer-3 distinct widgets; freeze never shows agent attribution; `RequestClamped`/`RequestRejected` surfaced prominently (proof "its number is never trusted"). **#1/#6** gauge reads an event field only, never fed back into a tx; LLM text display-only. **Feed id:** agent resolves live beta id at startup, streams to dashboard; dashboard never hardcodes. **v1/v2 isolation:** dashboard + deepbook on v2; agent a separate v1 process; they talk over HTTP/SSE, never share a `@mysten/sui` import.

### Acceptance gate
`pnpm --filter dashboard dev` serves; wallet connects on testnet; gauge + 4 panels render live. Each attack scene against the **deployed** package: Scene 1 → CAUTION tighten event AND an independent contract-only `Frozen` event (two distinct widgets); Scene 2 → CAUTION tightens with all univariate z sub-threshold while Mahalanobis crosses χ²(k), and **no** freeze fires; Scene 3 → bogus/malicious submissions appear as `RequestRejected`/clamped, killing the agent leaves the system safe (Layer 1 still aborts); Scene 4 → DAO `unfreeze` succeeds only with the cap-owning wallet. Action log shows real tx digests; timer reads in seconds. Playwright captures 5 hero frames. Recorded run ≤5:00, uploaded unlisted, linked in README; logo 1:1; KYC + no-OFAC noted.

### Estimate
~2.5–3 days (Jun 18–20). Hard dependency: ABI frozen (Step 2) + package deployed with stable IDs (Step 3) before sub-task 5 onward; the SPA shell (2–4) can proceed in parallel against a mock ABI.

---

## Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Unit-normalization parity wrong-but-green** — coin-decimal sign (`10^(BASE−QUOTE)`=×10³, NOT the must-fix #7 literal), I64/expo on both price+conf, integer rounding-order → constant offset → FROZEN fires always-or-never | **CRITICAL** | One source for the sign (Step 1 corrected). **Hand-verify** the TS reference produces $0.764 vs a live ~$0.74 quote *before* trusting the parity test. V0 (`div==0`) gates both sides. If TS≠Move, re-derive by hand — TS is not authoritative. |
| R2 | **First testnet deploy + zero gas** — long pole, gas is a hard blocker, floating Pyth/Wormhole HEADs can shift the digest | **CRITICAL** | Faucet + bank gas **Jun 12**. Commit `Move.lock`; re-pull HEADs only in a scratch dir, adopt only if parity stays green. +0.5d buffer in Step 3. |
| R3 | **Move long pole** — full 3-layer body + vault + injection ≈ 5 Move-days, no slack; #7 alone ~1d | **CRITICAL** | Move-first calendar; Step 5 ahead of Step 4; Jun 19 buffer; Jun 21 reserve. Emergency rung = ship the minimal read-only `evaluate` (still satisfies all 4 must-haves). |
| R4 | **ABI drift across steps** — three step-specs quote three different `evaluate` arg lists; permissionless-vs-gated collision | HIGH | **Freeze BOTH `submit`(gated) + `poke`(permissionless) at Step 2.** Steps 4/5/6 quote the deployed signature via `getNormalizedMoveModule`, not prose. `ParamRequest` is a struct (constructor moveCall or flattened u16s). |
| R5 | **Live agent score = raw χ² (saturates ~100)** — gates fire constantly, Scene 2 won't reproduce | HIGH | `calibrate.ts` empirical-percentile is the **single** score to gate, event, and gauge. |
| R6 | **Loss-of-signal → instant freeze on the 1-tick/side book** bricks the demo | HIGH | Loss-of-signal → CAUTION only; FROZEN solely on `div_own ≥ T` two-sided (or N sustained empty ticks, documented). |
| R7 | **Dashboard byte-coupled to un-frozen event ABI** | MED | Sub-task 1 is a blocking prereq; emit all events from the `guardian` module so one `MoveModule` filter catches them. |
| R8 | **Single video window collides with first-ever end-to-end** | MED | Jun 17 = first end-to-end; Jun 19 = dry-run + **bank per-scene fallback footage**; Jun 20 = record/edit; Jun 21 reserve. |
| R9 | **External-latency submission items forgotten** (KYC turnaround, YouTube processing, logo) | MED | KYC + faucet + placeholder logo **Jun 12**. |
| R10 | **Path/constants drift** — `/home/seawall` vs `/home/sui-overflow`; `TAU=90`; EWMA λ: code defaults 0.97/0.94 ≠ backtest 0.99; two `div` quantities | MED (credibility) | Move package under `/home/seawall/packages/guardian`; replace `TAU`→`ALERT_SCORE/ALERT_TICKS`; set live `Detector` + `constants.ts` defaults to **0.99** (the doc is already correct — do NOT change it); name on-chain divergence `divergence1e9`. |
| R11 | **Agent divergence leaking onto the freeze path** | MED | Agent's DeepBook read feeds ONLY the advisory score; freeze is 100% the contract's on-chain re-derivation. Ratchet baseline from `RiskEvaluated.applied_*`, never from what the agent requested. |

---

## Descope / fallback ladder

Cut from the bottom up; each rung still ships a submittable, must-have-satisfying state. **Do not cut past the floor.**

```
CUT 1st  — IsolationForest/ONNX stretch model. Already gated as stretch; drop silently.
CUT 2nd  — CEX live depth + cross-venue dispersion live feed. Backtest proves the features; run live
           on Pyth+DeepBook only, cite CEX in METHODOLOGY.
CUT 3rd  — Dashboard polish: drop EWMA small-multiples + per-feature bars to a single Mahalanobis-vs-χ²
           chart + gauge + action log. Keep the 3 must-have widgets.
CUT 4th  — Scene 2 as a LIVE testnet scene → show it as the accelerated synthetic replay + the static
           backtest chart only. Scenes 1,3,4 stay live. (Keep Scene 2's STORY even if not live.)
CUT 5th  — RELAX live on-chain → ship it tested in Move, demo unfreeze via DAO only (Scene 4).
========= FLOOR — below this you no longer satisfy the track. Do NOT cut past here. =========
KEEP (the submittable minimum):
  • ONE deployed GuardianPolicy on testnet, package ID in README.
  • evaluate() that re-derives Pyth↔DeepBook divergence ON-CHAIN (the judge criterion).
  • Layer-3 contract-only FREEZE on div≥T               (must-have #3: autonomous on-chain action).
  • Layer-2 CAUTION clamp originated by the AGENT'S PTB  (must-have #3 attribution + #2 score).
  • &GovernanceCap unfreeze                              (must-have #4 human override).
  • Live Pyth feed in the PTB                            (must-have #1).
  • ≤5min video + public repo + 1:1 logo + KYC + no-OFAC.
EMERGENCY (Move slips catastrophically ~Jun 18, no full body):
  • Deploy the MINIMAL read-only evaluate() (Step 2 body: assert feed-id, read both, re-derive, emit
    RiskEvaluated, contract-only freeze flag) WITHOUT the full CAUTION clamp/RELAX/vault. This alone
    satisfies must-haves #1/#2/#3(freeze)/#4 and the judge's "re-derive on-chain" line. The full 3-layer
    body becomes post-deadline polish (June 21 is a SOFT cutoff for shortlisting; later changes help only
    Demo Day).
```

---

## Submission checklist

| Item | Required | Status now | Owner step / day | Risk |
|---|---|---|---|---|
| Public GitHub repo | Yes | Private/local | Jun 20 | LOW — verify no secrets/`.env` in history before flipping |
| Demo video ≤5min (YouTube) | Yes | Not started | Jun 20 (record); Jun 19 fallback footage | HIGH — single window + processing latency |
| Logo 1:1 | Yes | None on disk | Jun 12 placeholder → Jun 20 final | MED — trivial but forgotten |
| Testnet deploy + package ID in README | Yes | No Move pkg, no deploy, **zero gas** | Jun 14 deploy; gas Jun 12 | CRITICAL — long pole + gas blocker |
| KYC (≥1 member) | Yes | Not started | **Jun 12 START** | HIGH — external verification latency |
| No OFAC region | Yes | Compliant | Jun 20 (README note) | LOW |
| Live price feed (#1) | Yes | Pyth adapter built; not in a PTB | Jun 14 / 16 | MED |
| Visible AI risk score (#2) | Yes | Model built; no event/dashboard surface | Jun 16 / 18 | MED |
| Autonomous on-chain action via Move policy (#3) | Yes | **Move policy does not exist** | Jun 14 / 15 | CRITICAL |
| Human override (#4) | Yes | `&GovernanceCap` designed, not built | Jun 15 | MED |
| METHODOLOGY.md + backtests + measured error rate | Judge-committed | **DONE** (`docs/ml-methodology.md`, `ml-backtest.md`); doc λ=0.99 is correct — align CODE defaults to 0.99 | Jun 12 (code λ fix) | LOW |
| Named feature list + joint-anomaly catch | Judge-committed | DONE (Scene 2 beat) | — | none |
| Prior-art attribution (Kritzman-Li + RiskMetrics) | Judge-committed | DONE | — | none |
| Rename "Sentinel" → generic | Self-imposed | Repo already **Seawall** ✅ | Jun 12 | confirm no stale "Sentinel" strings before public |

**Bottom line:** the off-chain half is genuinely done and strong; the on-chain half — the part the track scores on must-have #3 and the judge's named make-or-break — is entirely unbuilt with 9 days and no slack. The ordering is correct and the timeline is tight-but-achievable **only if** Move work starts today, KYC + faucet + placeholder logo are pulled to Jun 12, Step 5 deploys before the agent points at it, and Jun 19 is held as integration+buffer with banked fallback footage. The most likely failure is a silently-wrong unit parity (R1) or the video window colliding with first end-to-end (R8); the emergency rung (minimal read-only `evaluate`) is the insurance that still satisfies all four must-haves.
