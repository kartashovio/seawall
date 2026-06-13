# `guardian` package — frozen ABI (Step 1, 2026-06-12)

The authoritative machine truth is always `getNormalizedMoveModule` against the
**deployed** package (R4) — this document is the human map of that surface.
Everything below is what Steps 2–6 (deploy script, agent, keeper, dashboard,
vault) bind to. Changing any signature/event after Step 2's deploy means a
redeploy + re-bind everywhere.

## ⚠️ Generic type-argument orders (R7 — the known trap)

| Function | Type args | For SUI/DBUSDC |
|---|---|---|
| `guardian::poke<Base, Quote>` | base, quote | `[SUI_TYPE, DBUSDC_TYPE]` |
| `guardian::submit<Base, Quote>` | base, quote | `[SUI_TYPE, DBUSDC_TYPE]` |
| `divergence::read_divergence<Base, Quote>` | base, quote | `[SUI_TYPE, DBUSDC_TYPE]` |
| `demo_vault::DemoVault<phantom Quote, Base>` (Step 3) | **quote, base** | `[DBUSDC_TYPE, SUI_TYPE]` |

The vault's order **differs** from the guardian entries. Every caller uses the
per-function declared order; never copy type args between the two families.

## Module `guardian::guardian`

### Structs

```move
public struct GuardianPolicy has key { … }        // shared; field set below
public struct GovernanceCap has key, store { id: UID, policy_id: ID }   // OWNED, never embedded
public struct ParamRequest has copy, drop { max_ltv_target_bps: u16, borrow_cap_target_bps: u16 }
public struct PauseCap has store {}               // embedded in the policy (must-fix #2: safe)
public struct ParamCap has store {}
```

`GuardianPolicy` field order (CANONICAL — this supersedes the older BUILD_PLAN
ABI sketch; the three `@1e9` u128 fractions are grouped):

```move
id: UID, owner: address, registered_agent: address,
feed_id: vector<u8> /* 32 raw bytes */, expected_pool_id: ID,   // BOTH source identities, asserted every read
max_ltv_floor_bps, max_ltv_baseline_bps, max_ltv_current_bps: u16,
borrow_cap_floor_bps, borrow_cap_baseline_bps, borrow_cap_current_bps: u16,
threshold_t, d_caution, conf_frac_max: u128, max_age_secs: u64,
base_decimals, quote_decimals: u8,
paused: bool,
last_breach_ms, last_relax_ms, all_clear_window_ms, relax_cooldown_ms: u64, relax_step_frac_bps: u16,
last_check_ms, last_change_ms, epoch: u64,
pause_cap: PauseCap, param_cap: ParamCap,
```

**`expected_pool_id` (trust-min linchpin, added after the Step-1 adversarial
review):** the ONE canonical DeepBook pool the policy re-derives divergence
from. `read_divergence` asserts `object::id(pool) == expected_pool_id` BEFORE
reading the book, so neither the permissionless `poke` caller nor the agent can
substitute a fake-calm pool (→ suppress a real freeze, fail-OPEN) or an empty
junk pool (→ permissionless freeze-DoS). The id also pins the concrete typed
`Pool<Base,Quote>`. This is the DeepBook twin of the Pyth `feed_id` assert.

### Entry surface (what PTBs call)

```move
// agent path — sender must equal policy.registered_agent
public fun submit<Base, Quote>(
    policy: &mut GuardianPolicy, pio: &PriceInfoObject, pool: &Pool<Base, Quote>,
    clock: &Clock, req: ParamRequest, advisory_score: u8, ctx: &TxContext)

// permissionless params-less path — keeper tick AND vault inline floor (D5).
// Returns the reading so the vault values collateral with the SAME price.
public fun poke<Base, Quote>(
    policy: &mut GuardianPolicy, pio: &PriceInfoObject, pool: &Pool<Base, Quote>,
    clock: &Clock): DivResult

public fun new_param_request(max_ltv_target_bps: u16, borrow_cap_target_bps: u16): ParamRequest

// factory: shares the policy, RETURNS the GovernanceCap — the PTB must
// TransferObjects it to the DAO address explicitly.
public fun create_policy(
    registered_agent: address, feed_id: vector<u8> /* 32 RAW bytes */,
    expected_pool_id: ID /* the canonical SUI_DBUSDC pool object id */,
    max_ltv_floor_bps: u16, max_ltv_baseline_bps: u16,
    borrow_cap_floor_bps: u16, borrow_cap_baseline_bps: u16,
    threshold_t: u128, d_caution: u128, conf_frac_max: u128, max_age_secs: u64,
    base_decimals: u8, quote_decimals: u8,
    all_clear_window_ms: u64, relax_cooldown_ms: u64, relax_step_frac_bps: u16,
    clock: &Clock, ctx: &mut TxContext): GovernanceCap
```

`create_policy` validation (aborts): corridors `floor<=baseline<=10000`
(`EInvalidCorridor`); `0<d_caution<threshold_t<=PRICE_SCALE` and
`0<conf_frac_max<=PRICE_SCALE` and `max_age_secs>0` (`EInvalidThresholds`);
`feed_id` length 32 (`EBadFeedId`); `base/quote_decimals<=18`
(`EInvalidDecimals`); `0<relax_step_frac_bps<=10000` AND every non-degenerate
span yields a `>=1` bps step (`EInvalidRelaxStep`).

Agent PTB shape (Step 4): `updatePriceFeeds(tx, …)` → `new_param_request(u16, u16)`
→ pass the result into `submit(...)` — all in ONE PTB. Keeper PTB (Step 5):
`updatePriceFeeds` → `poke(...)`, return value discarded.

### Governance (all `&GovernanceCap` as 2nd param; asserts `cap.policy_id`)

```move
public fun governance_unfreeze(policy: &mut GuardianPolicy, cap: &GovernanceCap, clock: &Clock)
public fun governance_set_corridor(policy: &mut GuardianPolicy, cap: &GovernanceCap,
    max_ltv_floor_bps: u16, max_ltv_baseline_bps: u16,
    borrow_cap_floor_bps: u16, borrow_cap_baseline_bps: u16, clock: &Clock)
public fun governance_rotate_agent(policy: &mut GuardianPolicy, cap: &GovernanceCap,
    new_agent: address, clock: &Clock)
```

Semantics notes: `governance_unfreeze` is absolute (a persisting breach simply
re-freezes on the next evaluation) and **resets the quiet window**
(`last_breach_ms := now`, stricter-than-spec, recorded); `governance_set_corridor`
clamps `current` into the new corridor — the one legitimate instant-loosen path.

### Getters (vault/dashboard/keeper read surface)

`is_paused, max_ltv_current_bps, borrow_cap_current_bps, max_ltv_floor_bps,
max_ltv_baseline_bps, borrow_cap_floor_bps, borrow_cap_baseline_bps,
registered_agent, owner, feed_id, expected_pool_id, max_age_secs, conf_frac_max,
threshold_t, d_caution, last_check_ms, last_change_ms, last_breach_ms,
last_relax_ms, epoch` — all `(policy: &GuardianPolicy)`; plus
`governance_cap_policy_id(cap)`.

### Events (dashboard `queryEvents` binds to these; u64/u128 arrive as decimal strings → `BigInt()`)

| Event | Fields | When |
|---|---|---|
| `RiskEvaluated` | `policy_id, had_request, advisory_score, div_own: u128, conf_frac: u128, signal: u8, paused, max_ltv_current_bps, borrow_cap_current_bps, max_ltv_requested_bps, borrow_cap_requested_bps, epoch, ts_ms` | EVERY `apply_` (heartbeat). `requested_*` = the raw ask; == baseline on `poke` (`had_request=false`). `advisory_score`'s ONLY appearance. |
| `RequestClamped` | `policy_id, param: u8 (0=max_ltv, 1=borrow_cap), requested_bps, applied_bps, ts_ms` | agent ask modified toward safety (out-of-corridor or contract tighter) |
| `RequestRejected` | same fields | agent ask tried to LOOSEN — ratchet refused (the "malicious agent" money shot) |
| `Frozen` | `policy_id, div: u128, cause: u8 (0=divergence≥T, 1=book-not-ok), ts_ms` | L3, contract-only; emitted once per freeze (not on re-confirm) |
| `Unfrozen` | `policy_id, ts_ms` | governance only |
| `CorridorChanged` | `policy_id, 4×bps, ts_ms` | governance |
| `AgentRotated` | `policy_id, old_agent, new_agent, ts_ms` | governance |
| `PolicyCreated` | `policy_id, owner, registered_agent, ts_ms` | factory |

### Abort codes

| Const | Code | Module |
|---|---|---|
| `ENotRegisteredAgent` | 1 | guardian |
| `EWrongGovernanceCap` | 2 | guardian |
| `EInvalidCorridor` | 3 | guardian |
| `EInvalidThresholds` | 4 | guardian |
| `EBadFeedId` | 5 | guardian |
| `EInvalidRelaxStep` | 6 | guardian |
| `EInvalidDecimals` | 7 | guardian |
| `EWrongFeed` | 1 | divergence |
| `EExpoNotNegative` | 2 | divergence |
| `EZeroPrice` | 3 | divergence |
| `EWrongPool` | 4 | divergence |
| `EExpoTooLarge` | 5 | divergence |

CAUTION never aborts (clamp-and-log); the only abort paths are the divergence
read (stale Pyth / wrong feed / zero price — fail-CLOSED) and governance/factory
validation.

## Module `guardian::divergence`

```move
public struct DivResult has copy, drop { div, pyth_px_1e9, conf_frac: u128, signal: u8 }
public fun div / pyth_px_1e9 / conf_frac / signal (d: &DivResult)
public fun dbk_mid_1e9(bid_best: u64, ask_best: u64, base_decimals: u8, quote_decimals: u8): u128
public fun compute_divergence(price_mag: u64, expo_is_neg: bool, expo_mag: u64, conf_mag: u64,
    bid_best: u64, ask_best: u64, bid_empty: bool, ask_empty: bool,
    base_decimals: u8, quote_decimals: u8): (u128 /*div*/, u128 /*px*/, u128 /*conf_frac*/, u8 /*signal*/)
    // aborts: EExpoNotNegative, EExpoTooLarge (expo_mag > 18), EZeroPrice
public fun read_divergence<Base, Quote>(pool, pio, clock, expected_feed_id: &vector<u8>,
    expected_pool_id: ID, max_age_secs: u64, base_decimals: u8, quote_decimals: u8): DivResult
    // aborts: EWrongPool (pool id mismatch — asserted FIRST), EWrongFeed, + compute_divergence's
```

TS twin: `@seawall/shared` `divergence.ts`; shared fixture
`packages/shared/test/vectors.json` (Move twin literals in
`tests/divergence_tests.move`).

## apply_ semantics (the contract's whole brain — for reviewers)

1. **L3 freeze (contract-only, D1):** `!paused && (div ≥ threshold_t || book_not_ok)` → `paused := true`, emit `Frozen`.
2. **Contract-own target:** discrete tier 0–3 over `[d_caution, T)` in thirds; `book_not_ok → tier 3`; `conf_frac > conf_frac_max → ≥ tier 1`; `target = baseline − span·tier/3`.
3. **Agent term:** request's bps, or `baseline` on `poke`.
4. **Per param:** `target = min(clamp(agent), clamp(own))`; `target < current` → instant tighten; `target > current` → only the gated drip (one relax gate evaluated up-front for BOTH params: `!paused ∧ now−last_breach ≥ window ∧ now−last_relax ≥ cooldown ∧ fresh reading calm`); step = `span·relax_step_frac_bps/10000`, capped at target and baseline.
5. **Events:** ask ≠ applied → `RequestRejected` (ask was looser than pre-call current) else `RequestClamped`.
6. **Bookkeeping:** breach reading bumps `last_breach_ms`; `last_check_ms := now` always (D4); `last_change_ms` only on change; `epoch += 1`; emit `RiskEvaluated` always.

## Module `guardian::demo_vault` (the demo consumer — Step 3)

⚠️ **Type-arg order is `<Quote, Base>` = `[DBUSDC_TYPE, SUI_TYPE]`** — the OPPOSITE
of `poke<Base,Quote>`. Inside `borrow`/`withdraw`, the inner `poke` order is
inferred from `pool: &Pool<Base,Quote>`, so PTB callers only pass the vault order.

```move
public struct DemoVault<phantom Quote, phantom Base> has key { id, policy_id: ID, collateral: Balance<Base>, debt_quote_minor: u128 }
public struct VaultAction has copy, drop { vault_id, action: u8 /*0 dep/1 borrow/2 withdraw/3 repay*/, amount: u128, debt_after: u128, collateral_after: u64, ts_ms: u64 }

public fun create_vault<Quote, Base>(policy: &GuardianPolicy, ctx)            // shares the vault, bound to object::id(policy)
public fun deposit_collateral<Quote, Base>(vault: &mut, c: Coin<Base>)         // UNGATED (toward-safe)
public fun repay<Quote, Base>(vault: &mut, amount: u128)                       // UNGATED (clamps at 0)
// GATED — same-PTB Pyth: caller posts updatePriceFeeds then calls these with the fresh pio.
// Both run guardian::poke(&mut policy, pio, pool, clock) (Layer-1 inline floor, D5) then enforce.
public fun borrow<Quote, Base>(vault: &mut, policy: &mut GuardianPolicy, pio: &PriceInfoObject, pool: &Pool<Base,Quote>, clock, amount_quote_minor: u128)
public fun withdraw_collateral<Quote, Base>(vault: &mut, policy: &mut GuardianPolicy, pio, pool, clock, amount_base_minor: u64, ctx): Coin<Base>
public fun collateral_value_in_quote(coll_base_minor: u64, pyth_px_1e9: u128, base_dec, quote_dec): u128  // pure; coll value in Quote minor
public fun debt / collateral / policy_id (vault: &DemoVault)
```

Abort codes (module `demo_vault`): `EPolicyMismatch=1`, `EFrozen=2`, `ELtvExceeded=3`, `EBorrowCapExceeded=4`.
Solvency gate is cross-multiply (no division): `debt·BPS_DENOM ≤ {max_ltv|borrow_cap}_current_bps · coll_value`. Freeze (is_paused) checked first → fail-CLOSED. Demo simplifications: debt is a counter (no Coin<Quote> mint); `borrow_cap` is a second per-position LTV-style bound (prod = protocol-wide outstanding cap); `liquidate` is NOT gated (D6).

## Deployed (testnet) — `config/testnet.json` is canonical

IDs change on every redeploy (each new module → new package id). Current
(2026-06-13): package `0x2635919f…653ad`, `GuardianPolicy 0xd6497edc…`,
`GovernanceCap 0x9a72b115…`, `DemoVault 0xf9b3b69e…`, mis-bound policy
`0x4b09d173…`. Gates: GATE 2 (same-PTB `poke` success, anchor `div_own≈0.29%`) ✅,
GATE 2b (`EWrongPool`) ✅, GATE 3 (inline-floor `borrow` runs poke+enforces) ✅,
GATE 3b (over-borrow → `ELtvExceeded`) ✅.
