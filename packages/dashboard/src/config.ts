// Deployed IDs from config/testnet.json (the single source) + the gauge bands
// from @seawall/shared (NEVER hardcode — they must equal the contract thresholds)
// + the agent control-server URL (SSE + scene control).
import testnet from "../../../config/testnet.json";
import { MAX_LTV_BPS, BORROW_CAP_BPS, SCORE_LO, SCORE_HI, ALERT_SCORE, BPS_DENOM, D_CAUTION, T_FREEZE } from "@seawall/shared";

const t = testnet as Record<string, string>;

// `?policy=0x…` URL override (highest priority) so the FREEZE + DAO-unfreeze beat
// can be shown live by opening seawall.dev/?policy=<frozen demo policy> — no
// rebuild. Falls back to VITE_POLICY_ID (build-time), then the config default.
const policyFromUrl =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("policy") ?? undefined
    : undefined;
const validPolicy = policyFromUrl && /^0x[0-9a-fA-F]{6,}$/.test(policyFromUrl) ? policyFromUrl : undefined;

export const CFG = {
  packageId: t.packageId,
  // policy resolution: ?policy= URL → VITE_POLICY_ID → config default.
  policyId: validPolicy ?? (import.meta.env.VITE_POLICY_ID as string | undefined) ?? t.policyId,
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
