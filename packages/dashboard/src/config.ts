// Deployed IDs from config/testnet.json (the single source) + the gauge bands
// from @seawall/shared (NEVER hardcode — they must equal the contract thresholds)
// + the agent control-server URL (SSE + scene control).
import testnet from "../../../config/testnet.json";
import { MAX_LTV_BPS, BORROW_CAP_BPS, SCORE_LO, SCORE_HI, ALERT_SCORE, BPS_DENOM, D_CAUTION, T_FREEZE } from "@seawall/shared";

const t = testnet as Record<string, string>;

export const CFG = {
  packageId: t.packageId,
  // VITE_POLICY_ID lets the demo point the gauge/layers/governance at a specific
  // policy (e.g. the tight-T freeze policy for the FREEZE + DAO-unfreeze scenes).
  policyId: (import.meta.env.VITE_POLICY_ID as string | undefined) ?? t.policyId,
  governanceCapId: t.governanceCapId,
  vaultId: t.vaultId,
  poolId: t.poolId,
  agentUrl: (import.meta.env.VITE_AGENT_URL as string | undefined) ?? "http://localhost:8787",
  explorerTx: "https://suiscan.xyz/testnet/tx",
  explorerObj: "https://suiscan.xyz/testnet/object",
};

// Gauge bands + corridor, bound to the on-chain constants.
export const BANDS = { lo: SCORE_LO, hi: SCORE_HI, alert: ALERT_SCORE };
export const CORRIDOR = { maxLtv: MAX_LTV_BPS, borrowCap: BORROW_CAP_BPS, denom: BPS_DENOM };

// Divergence thresholds in bps, derived from the on-chain 1e9-fraction constants
// (D_CAUTION 1e7 = 1% = 100 bps, T_FREEZE 5e7 = 5% = 500 bps). The contract FREEZES
// (contract-only) when its own measured Pyth↔DeepBook divergence reaches `freezeBps`;
// CAUTION onset is `cautionBps`. Bound to shared constants — never hardcode.
export const DIV = {
  cautionBps: Number(D_CAUTION) / 1e5,
  freezeBps: Number(T_FREEZE) / 1e5,
};

export const pct = (bps: number): number => bps / 100; // 5500 → 55(%)
