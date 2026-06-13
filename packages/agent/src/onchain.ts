// Reads the live GuardianPolicy state — the AUTHORITATIVE ratchet baseline
// (max_ltv_current_bps / borrow_cap_current_bps) the agent compares its computed
// target against (correctness #16: never the agent's own last request).
import type { SuiClient } from "@mysten/sui/client";
import type { Bps } from "./policy-logic";

export interface PolicySnapshot {
  paused: boolean;
  applied: Bps; // current on-chain corridor position
  floor: Bps;
  baseline: Bps;
  lastCheckMs: number;
  lastChangeMs: number;
  epoch: number;
  registeredAgent: string;
}

const n = (x: unknown): number => Number(x as string);

export async function readPolicy(client: SuiClient, policyId: string): Promise<PolicySnapshot> {
  const o = await client.getObject({ id: policyId, options: { showContent: true } });
  const f = (o.data?.content as any)?.fields;
  if (!f) throw new Error(`policy ${policyId} has no content`);
  return {
    paused: !!f.paused,
    applied: { maxLtv: n(f.max_ltv_current_bps), borrowCap: n(f.borrow_cap_current_bps) },
    floor: { maxLtv: n(f.max_ltv_floor_bps), borrowCap: n(f.borrow_cap_floor_bps) },
    baseline: { maxLtv: n(f.max_ltv_baseline_bps), borrowCap: n(f.borrow_cap_baseline_bps) },
    lastCheckMs: n(f.last_check_ms),
    lastChangeMs: n(f.last_change_ms),
    epoch: n(f.epoch),
    registeredAgent: f.registered_agent as string,
  };
}
