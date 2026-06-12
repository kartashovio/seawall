// @seawall/keeper — Step 0 skeleton (v1 island).
//
// Pins the v1 `@mysten/sui` tree (pyth-sui-js@3.0.0 requires v1). This package
// MUST NOT import @seawall/model: the FREEZE/relax path is decided entirely
// on-chain inside `guardian::poke`, and the keeper only supplies scheduling + a
// fresh Pyth price + observability. A malicious keeper can only choose *when* to
// poke a deterministic function — it can never influence the outcome. The real
// 5-min params-less `poke` loop + drift-free scheduler land in Step 5.
import { getFullnodeUrl } from "@mysten/sui/client";

export function main(): void {
  // proves the v1 client surface resolves in THIS package's dependency island
  const fullnode = getFullnodeUrl("testnet");
  console.log(`[keeper] skeleton (v1); testnet fullnode = ${fullnode}`);
}
