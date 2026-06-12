/// Step-0 SKELETON ONLY. This module exists to prove the cross-module dependency
/// graph (DeepBook `Pool` + Pyth `PriceInfoObject`) compiles under the `guardian`
/// package — exactly the read the de-risk probe validated on testnet
/// (RESULTS.md, Spike B). The real `GuardianPolicy`, `compute_divergence`,
/// `submit`/`poke`/`apply_`, governance fns, and events land in Step 1, at which
/// point the ABI is frozen.
module guardian::guardian;

use deepbook::pool::Pool;
use pyth::price_info::PriceInfoObject;
use pyth::pyth;
use sui::clock::Clock;
use guardian::constants;

/// Reads BOTH sources on-chain in one call (abort-free book read + fresh Pyth),
/// proving the divergence inputs are reachable here. Returns the raw DeepBook mid
/// (FLOAT_SCALING units) and the 1e9 price scale. Logic is intentionally absent.
public fun skeleton_read<Base, Quote>(
    pool: &Pool<Base, Quote>,
    pio: &PriceInfoObject,
    clock: &Clock,
): (u64, u128) {
    // DeepBook: abort-free L2 read around the mid (TICKS >= 1).
    let (bid_p, _bid_q, ask_p, _ask_q) = pool.get_level2_ticks_from_mid(constants::ticks(), clock);

    // Loss-of-signal guard: empty/one-sided book => caller treats as BOOK_NOT_OK
    // (never index [0] blindly). Real handling lands in Step 1.
    let dbk_mid_raw = if (vector::is_empty(&bid_p) || vector::is_empty(&ask_p)) {
        0
    } else {
        (bid_p[0] + ask_p[0]) / 2
    };

    // Pyth: re-read the freshly-posted price in the same PTB (must-fix #1).
    let _price = pyth::get_price_no_older_than(pio, clock, constants::max_age_secs());

    (dbk_mid_raw, constants::price_scale())
}
